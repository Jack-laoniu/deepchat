import Anthropic from '@anthropic-ai/sdk';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadConfig, type Config } from './config';
import { ttsFromConfig, type Tts } from './tts';
import { chatFromConfig, discussNeed, generateLesson, reactLine, UpstreamError, type StartChat, type Turn } from './generate';

/**
 * 网页版的生成接口：
 *   GET  /api/config    → { generate, needCode, configError? }（服务器配了 API key 才能在线生成）
 *   POST /api/generate  { need, lang, context? } → { lesson } | { error }（context：再玩一轮时带上上一关的结果）
 *   POST /api/react     { need, who, as, q, options, text, recent, lang } → { say, mood }（角色回应用户自己打的字）
 *   POST /api/discuss   { plan, history, message, lang } → { reply } | { error }（结算后继续聊需求）
 *
 * 公开网站 + 按量计费，所以有几道保护：按 IP 限频、每日总量上限、并发上限、相同需求缓存。
 */

const MAX_NEED_CHARS = 200;

/**
 * key、模型、访问码、限额都来自配置文件（见 config.ts），每次请求都读一遍：
 * 文件没改时直接用缓存；改了就重建模型连接，不用重启服务。
 */
let built: { config: Config; start: StartChat | null; tts: Tts | null } | null = null;
function settings() {
  const { config, error } = loadConfig();
  if (built?.config !== config) {
    const m = chatFromConfig(config);
    console.error(m ? `online generation: ${m.label}` : 'online generation: off（没有配置 key）');
    const tts = ttsFromConfig(config);
    if (tts) console.error('server tts: on');
    built = { config, start: m?.start ?? null, tts };
  }
  const l = config.limits ?? {};
  return {
    client: built.start,
    tts: built.tts,
    ttsPerIpPerHour: config.tts?.perIpPerHour || 600,
    /** 测试期访问码：设置后，只有带对访问码的请求才能用服务器上的 key 生成 */
    accessCode: config.accessCode || '',
    perIpPerHour: l.perIpPerHour || 5,
    perDay: l.perDay || 200,
    concurrency: l.concurrency || 3,
    discussPerIpPerHour: l.discussPerIpPerHour || 30,
    error,
  };
}

const hits = new Map<string, number[]>();
const talkHits = new Map<string, number[]>();
const ttsHits = new Map<string, number[]>();
let day = '';
let dayCount = 0;
let running = 0;
const cache = new Map<string, unknown>();

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }).end(JSON.stringify(body));
}

function clientIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  return (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0].trim() || req.socket.remoteAddress || '?';
}

function allow(ip: string, perIpPerHour: number, perDay: number, bucket = hits, countDay = true): 'ok' | 'ip' | 'day' {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    dayCount = 0;
  }
  if (countDay && dayCount >= perDay) return 'day';
  const now = Date.now();
  const recent = (bucket.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= perIpPerHour) return 'ip';
  recent.push(now);
  bucket.set(ip, recent);
  if (countDay) dayCount++;
  return 'ok';
}

async function readBody(req: IncomingMessage, limit = 4096): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new Error('too large');
    chunks.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
}

/** 处理了返回 true */
export async function handleApi(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
  const cfg = settings();
  const client = cfg.client;
  if (path === '/api/config' && req.method === 'GET') {
    json(res, 200, { generate: !!client, needCode: !!cfg.accessCode, tts: !!cfg.tts, ...(cfg.error ? { configError: cfg.error } : {}) });
    return true;
  }
  if (path === '/api/discuss') return discuss(req, res, cfg);
  if (path === '/api/react') return react(req, res, cfg);
  if (path === '/api/tts') return speech(req, res, cfg);
  if (path !== '/api/generate') return false;
  if (req.method !== 'POST') return void json(res, 405, { error: 'method' }), true;
  if (!client) return void json(res, 503, { error: 'disabled' }), true;

  let body: { need?: unknown; lang?: unknown; code?: unknown; context?: unknown };
  try {
    body = (await readBody(req, 32_000)) as typeof body;
  } catch {
    return void json(res, 400, { error: 'bad_request' }), true;
  }
  if (cfg.accessCode && body?.code !== cfg.accessCode) return void (console.error('generate: wrong access code'), json(res, 403, { error: 'code' })), true;
  const need = typeof body?.need === 'string' ? body.need.trim() : '';
  const lang = body?.lang === 'en' ? 'en' : 'zh';
  if (!need || [...need].length > MAX_NEED_CHARS) return void json(res, 400, { error: 'need' }), true;

  const context = typeof body?.context === 'string' ? body.context.slice(0, MAX_PLAN_CHARS) : '';
  const key = `${lang}:${need}:${context}`;
  if (cache.has(key)) return void (console.error(`generate: cache hit (${lang}) ${need.slice(0, 40)}`), json(res, 200, { lesson: cache.get(key) })), true;

  const verdict = allow(clientIp(req), cfg.perIpPerHour, cfg.perDay);
  if (verdict !== 'ok') return void (console.error(`generate: rate limited (${verdict})`), json(res, 429, { error: verdict === 'ip' ? 'rate_ip' : 'rate_day' })), true;
  if (running >= cfg.concurrency) return void json(res, 429, { error: 'busy' }), true;

  running++;
  const t0 = Date.now();
  const secs = () => `${Math.round((Date.now() - t0) / 1000)}s`;
  console.error(`generate: start (${lang}${context ? ', follow-up' : ''}) ${need.slice(0, 40)}`);
  // 用户关掉页面/断网：记下来，方便区分「接口慢」和「前端放弃了」
  req.socket.once('close', () => Date.now() - t0 > 1000 && !res.writableEnded && console.error(`generate: client went away after ${secs()}`));
  try {
    const r = await generateLesson(client, need, lang, context);
    console.error(`generate: ${r.ok ? 'ok' : r.error} after ${secs()}`);
    if (!r.ok) return void json(res, 422, { error: r.error }), true;
    cache.set(key, r.lesson);
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    json(res, 200, { lesson: r.lesson });
  } catch (e) {
    console.error(`generate: failed after ${secs()}`);
    upstreamFailed(res, 'generate', e);
  } finally {
    running--;
  }
  return true;
}

function upstreamFailed(res: ServerResponse, what: string, e: unknown) {
  console.error(`${what} failed:`, e instanceof Anthropic.APIError || e instanceof UpstreamError ? `${e.status} ${e.message}` : e);
  const status = e instanceof Anthropic.RateLimitError || (e instanceof UpstreamError && e.status === 429) ? 429 : 502;
  // detail 只给状态码，方便排查（401 = key 不对，404 = 地址或模型名不对，400 = 参数不被接受…），不带上游原文
  const detail = e instanceof Anthropic.APIError || e instanceof UpstreamError ? `HTTP ${e.status}` : (e as Error)?.name === 'TimeoutError' ? 'timeout' : 'network';
  json(res, status, { error: status === 429 ? 'busy' : 'upstream', detail });
}

const MAX_PLAN_CHARS = 8000;
const MAX_TURNS = 16;
const MAX_MESSAGE_CHARS = 400;

async function discuss(req: IncomingMessage, res: ServerResponse, cfg: ReturnType<typeof settings>): Promise<boolean> {
  if (req.method !== 'POST') return void json(res, 405, { error: 'method' }), true;
  if (!cfg.client) return void json(res, 503, { error: 'disabled' }), true;

  let body: { plan?: unknown; history?: unknown; message?: unknown; lang?: unknown; code?: unknown };
  try {
    body = (await readBody(req, 32_000)) as typeof body;
  } catch {
    return void json(res, 400, { error: 'bad_request' }), true;
  }
  if (cfg.accessCode && body?.code !== cfg.accessCode) return void json(res, 403, { error: 'code' }), true;
  const plan = typeof body?.plan === 'string' ? body.plan.slice(0, MAX_PLAN_CHARS) : '';
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  const history: Turn[] = (Array.isArray(body?.history) ? body.history : [])
    .filter((t): t is Turn => (t?.role === 'user' || t?.role === 'assistant') && typeof t?.content === 'string')
    .slice(-MAX_TURNS)
    .map((t) => ({ role: t.role, content: t.content.slice(0, 1200) }));
  // 历史必须从用户开始、一问一答交替，否则模型接口会拒绝
  while (history[0]?.role === 'assistant') history.shift();
  if (!plan || !message || [...message].length > MAX_MESSAGE_CHARS) return void json(res, 400, { error: 'need' }), true;
  const lang = body?.lang === 'en' ? 'en' : 'zh';

  const verdict = allow(clientIp(req), cfg.discussPerIpPerHour, cfg.perDay, talkHits);
  if (verdict !== 'ok') return void json(res, 429, { error: verdict === 'ip' ? 'rate_ip' : 'rate_day' }), true;
  if (running >= cfg.concurrency) return void json(res, 429, { error: 'busy' }), true;

  running++;
  try {
    const reply = await discussNeed(cfg.client, { plan, history, message, lang });
    if (!reply) return void json(res, 422, { error: 'refused' }), true;
    json(res, 200, { reply });
  } catch (e) {
    upstreamFailed(res, 'discuss', e);
  } finally {
    running--;
  }
  return true;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function react(req: IncomingMessage, res: ServerResponse, cfg: ReturnType<typeof settings>): Promise<boolean> {
  if (req.method !== 'POST') return void json(res, 405, { error: 'method' }), true;
  if (!cfg.client) return void json(res, 503, { error: 'disabled' }), true;
  let body: Record<string, unknown>;
  try {
    body = (await readBody(req, 16_000)) as typeof body;
  } catch {
    return void json(res, 400, { error: 'bad_request' }), true;
  }
  if (cfg.accessCode && body?.code !== cfg.accessCode) return void json(res, 403, { error: 'code' }), true;
  const text = str(body?.text, MAX_MESSAGE_CHARS);
  const who = str(body?.who, 40);
  if (!text || !who) return void json(res, 400, { error: 'need' }), true;
  const list = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.slice(-n).map((x) => str(x, max)).filter(Boolean) : []);

  // 和「继续聊」共用每 IP 的聊天额度
  const verdict = allow(clientIp(req), cfg.discussPerIpPerHour, cfg.perDay, talkHits);
  if (verdict !== 'ok') return void json(res, 429, { error: verdict === 'ip' ? 'rate_ip' : 'rate_day' }), true;
  if (running >= cfg.concurrency) return void json(res, 429, { error: 'busy' }), true;

  running++;
  try {
    const r = await reactLine(cfg.client, {
      need: str(body?.need, MAX_NEED_CHARS),
      who,
      as: str(body?.as, 40) || undefined,
      q: str(body?.q, 200),
      options: list(body?.options, 4, 60),
      text,
      recent: list(body?.recent, 8, 200),
      lang: body?.lang === 'en' ? 'en' : 'zh',
    });
    if (!r) return void json(res, 422, { error: 'refused' }), true;
    json(res, 200, r);
  } catch (e) {
    upstreamFailed(res, 'react', e);
  } finally {
    running--;
  }
  return true;
}

/** 朗读一句台词，返回 mp3（只在浏览器自己念不出声时用；不计入每日生成上限，单独按 IP 限次） */
async function speech(req: IncomingMessage, res: ServerResponse, cfg: ReturnType<typeof settings>): Promise<boolean> {
  if (req.method !== 'POST') return void json(res, 405, { error: 'method' }), true;
  if (!cfg.tts) return void json(res, 503, { error: 'disabled' }), true;
  let body: Record<string, unknown>;
  try {
    body = (await readBody(req, 4096)) as typeof body;
  } catch {
    return void json(res, 400, { error: 'bad_request' }), true;
  }
  if (cfg.accessCode && body?.code !== cfg.accessCode) return void json(res, 403, { error: 'code' }), true;
  const text = str(body?.text, 300);
  if (!text) return void json(res, 400, { error: 'need' }), true;
  if (allow(clientIp(req), cfg.ttsPerIpPerHour, cfg.perDay, ttsHits, false) !== 'ok') return void json(res, 429, { error: 'rate_ip' }), true;
  try {
    const mp3 = await cfg.tts(text, body?.g === 'm' ? 'm' : 'f');
    res.writeHead(200, { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=86400' }).end(mp3);
  } catch (e) {
    upstreamFailed(res, 'tts', e);
  }
  return true;
}
