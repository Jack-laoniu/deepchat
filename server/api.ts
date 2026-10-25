import Anthropic from '@anthropic-ai/sdk';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadConfig, type Config } from './config';
import { keep } from './store';
import { ttsFromConfig, type Tts } from './tts';
import { genericLesson } from '../src/lesson/generic';
import { dropDecided } from '../src/lesson/salvage';
import { parseLesson } from '../src/lesson/schema';
import { charById } from '../src/chars/library';
import { cameoById } from '../src/chars/cameos';
import { chatFromConfig, discussNeed, finaleFor, friendChat, groupChat, suggestCameos, type Member, generateLesson, reactLine, UpstreamError, type GenerateResult, type ModelChoice, type StartChat, type Turn } from './generate';

/**
 * 网页版的生成接口：
 *   GET  /api/config    → { generate, needCode, configError? }（服务器配了 API key 才能在线生成）
 *   POST /api/generate  { need, lang, context?, memory? } → { lesson } | { error }（context：再玩一轮时带上上一关的结果；memory：用户以前闯过的需求）
 *   POST /api/react     { need, who, as, q, options, text, recent, lang } → { say, mood }（角色回应用户自己打的字）
 *   POST /api/discuss   { plan, history, message, lang } → { reply } | { error }（结算后继续聊需求）
 *   POST /api/clientlog { message, stack, title, round } → 204（某一回合在浏览器里渲染出错，记进日志）
 *
 * 公开网站 + 按量计费，所以有几道保护：按 IP 限频、每日总量上限、并发上限、相同需求缓存。
 */

const MAX_NEED_CHARS = 200;

/** 前端某一回合渲染出错：打进日志（每个 IP 每小时最多 20 条，防刷） */
const clientLogs = new Map<string, { n: number; at: number }>();
async function clientLog(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') return void res.writeHead(405).end(), true;
  const ip = clientIp(req);
  const now = Date.now();
  const c = clientLogs.get(ip);
  const n = c && now - c.at < 3600_000 ? c.n + 1 : 1;
  clientLogs.set(ip, { n, at: c && now - c.at < 3600_000 ? c.at : now });
  let body = null as { message?: unknown; stack?: unknown; title?: unknown; round?: unknown } | null;
  try {
    body = (await readBody(req, 32_000)) as typeof body;
  } catch {
    /* 太大或不是 JSON */
  }
  if (n <= 20 && body) {
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
    console.error(`client error in 「${str(body.title, 40)}」: ${str(body.message, 300)}\n  stack: ${str(body.stack, 800).split('\n').slice(0, 4).join(' | ')}\n  round: ${str(body.round, 4000)}`);
  }
  res.writeHead(204).end();
  return true;
}

/**
 * key、模型、访问码、限额都来自配置文件（见 config.ts），每次请求都读一遍：
 * 文件没改时直接用缓存；改了就重建模型连接，不用重启服务。
 */
let built: { config: Config; start: StartChat | null; model: ModelChoice | null; tts: Tts | null } | null = null;
function settings() {
  const { config, error } = loadConfig();
  if (built?.config !== config) {
    const m = chatFromConfig(config);
    console.error(m ? `online generation: ${m.label}` : 'online generation: off（没有配置 key）');
    const tts = ttsFromConfig(config);
    if (tts) console.error('server tts: on');
    built = { config, start: m?.start ?? null, model: m, tts };
  }
  const l = config.limits ?? {};
  return {
    client: built.start,
    model: built.model,
    budgetMs: (config.generateBudgetSec ?? 300) * 1000,
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
/** 正在生成的请求（按缓存 key）：重复的请求等同一份结果 */
const inflight = new Map<string, Promise<object>>();
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
  if (path === '/api/clientlog') return clientLog(req, res);
  if (path === '/api/finale') return finale(req, res, cfg);
  if (path === '/api/friend') return friend(req, res, cfg);
  if (path === '/api/cameos') return cameos(req, res, cfg);
  if (path !== '/api/generate') return false;
  if (req.method !== 'POST') return void json(res, 405, { error: 'method' }), true;
  if (!client) return void json(res, 503, { error: 'disabled' }), true;

  let body: { need?: unknown; lang?: unknown; code?: unknown; context?: unknown; avoid?: unknown; memory?: unknown };
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
  const avoid = Array.isArray(body?.avoid) ? body.avoid.filter((x): x is string => typeof x === 'string').slice(0, 60).map((x) => x.slice(0, 60)) : [];
  // 这台设备记住的、用户以前闯过的需求：交给模型，让角色记得
  const memory = typeof body?.memory === 'string' ? body.memory.slice(0, 4000) : '';
  const key = `${lang}:${need}:${context}:${memory}`;
  if (cache.has(key)) return void (console.error(`generate: cache hit (${lang}) ${need.slice(0, 40)}`), json(res, 200, { lesson: cache.get(key) })), true;

  // 同一个请求还在生成（浏览器断线后自动重试）：不重新生成，直接等那一份的结果
  const pending = inflight.get(key);
  if (pending) {
    console.error(`generate: joined the running generation ${need.slice(0, 40)}`);
    return void json(res, 200, await pending), true;
  }

  const verdict = allow(clientIp(req), cfg.perIpPerHour, cfg.perDay);
  if (verdict !== 'ok') return void (console.error(`generate: rate limited (${verdict})`), json(res, 429, { error: verdict === 'ip' ? 'rate_ip' : 'rate_day' })), true;
  if (running >= cfg.concurrency) return void json(res, 429, { error: 'busy' }), true;

  const job = produce(req, res, cfg, client, { need, lang, context, avoid, memory, key });
  inflight.set(key, job);
  try {
    json(res, 200, await job);
  } finally {
    inflight.delete(key);
  }
  return true;
}

type Job = { need: string; lang: 'zh' | 'en'; context: string; avoid: string[]; memory: string; key: string };

async function produce(req: IncomingMessage, res: ServerResponse, cfg: ReturnType<typeof settings>, client: StartChat, { need, lang, context, avoid, memory, key }: Job): Promise<object> {
  running++;
  const t0 = Date.now();
  const secs = () => `${Math.round((Date.now() - t0) / 1000)}s`;
  console.error(`generate: start (${lang}${context ? ', follow-up' : ''}${memory ? ', with memory' : ''}) ${need.slice(0, 40)}`);
  // 用户关掉页面/断网：记下来，方便区分「接口慢」和「前端放弃了」
  req.socket.once('close', () => Date.now() - t0 > 1000 && !res.writableEnded && console.error(`generate: client went away after ${secs()}`));
  // 降级链：主模型 → 备用模型（配了的话）→ 兜底的通用关卡。任何一步都不让用户只看到一个报错
  const deadline = t0 + cfg.budgetMs;
  const attempt = async (start: StartChat, label: string): Promise<GenerateResult | { ok: false; error: string; detail: string }> => {
    try {
      return await generateLesson(start, need, lang, context, deadline, memory);
    } catch (e) {
      const detail = e instanceof Anthropic.APIError || e instanceof UpstreamError ? `HTTP ${e.status}` : (e as Error)?.name ?? 'error';
      console.error(`generate: ${label} failed after ${secs()}:`, e instanceof Error ? e.message : e);
      return { ok: false, error: 'upstream', detail };
    }
  };
  try {
    let r = await attempt(client, cfg.model!.label);
    if (!r.ok && cfg.model?.fallback && Date.now() < deadline - 30_000) {
      console.error(`generate: trying fallback model ${cfg.model.fallback.label}`);
      r = await attempt(cfg.model.fallback.start, cfg.model.fallback.label);
    }
    console.error(`generate: ${r.ok ? 'ok' : r.error} after ${secs()}`);
    if (r.ok && avoid.length) {
      const d = dropDecided(r.lesson, avoid);
      if (d.dropped.length) console.error(`generate: removed already-decided cards: ${d.dropped.join(', ')}`);
      r = { ok: true, lesson: d.lesson };
    }
    if (r.ok) {
      const file = keep('level', JSON.stringify({ need, lesson: r.lesson }, null, 1));
      if (file) console.error(`generate: saved ${file}`);
      cache.set(key, r.lesson);
      if (cache.size > 200) cache.delete(cache.keys().next().value!);
      return { lesson: r.lesson };
    }
    // 兜底：不依赖模型的通用关卡（不进缓存，下次还会再试模型）
    console.error('generate: serving the generic fallback level');
    return { lesson: genericLesson(need, lang), generic: true, reason: 'detail' in r ? r.detail : r.error };
  } finally {
    running--;
  }
}

function upstreamFailed(res: ServerResponse, what: string, e: unknown) {
  console.error(`${what} failed:`, e instanceof Anthropic.APIError || e instanceof UpstreamError ? `${e.status} ${e.message}` : e);
  const status = e instanceof Anthropic.RateLimitError || (e instanceof UpstreamError && e.status === 429) ? 429 : 502;
  // detail 只给状态码，方便排查（401 = key 不对，404 = 地址或模型名不对，400 = 参数不被接受…），不带上游原文
  const detail = e instanceof Anthropic.APIError || e instanceof UpstreamError ? `HTTP ${e.status}` : (e as Error)?.name === 'TimeoutError' ? 'timeout' : 'network';
  json(res, status, { error: status === 429 ? 'busy' : 'upstream', detail });
}

/**
 * 个性化终章：用户玩到倒数几关时前端在后台发来这一局的选择和原话，按它重写最后一关。
 * 用的是聊天的额度（不占生成关卡的次数）；失败就回 {}，前端用原来的终章。
 */
async function finale(req: IncomingMessage, res: ServerResponse, cfg: ReturnType<typeof settings>): Promise<boolean> {
  if (req.method !== 'POST') return void json(res, 405, { error: 'method' }), true;
  if (!cfg.client) return void json(res, 503, { error: 'disabled' }), true;
  let body: { lesson?: unknown; journey?: unknown; code?: unknown; memory?: unknown; guest?: unknown };
  try {
    body = (await readBody(req, 96_000)) as typeof body;
  } catch {
    return void json(res, 400, { error: 'bad_request' }), true;
  }
  if (cfg.accessCode && body?.code !== cfg.accessCode) return void json(res, 403, { error: 'code' }), true;
  const parsed = parseLesson(body?.lesson);
  const journey = typeof body?.journey === 'string' ? body.journey.slice(0, 8000) : '';
  if (!parsed.ok || !journey) return void json(res, 400, { error: 'need' }), true;
  const memory = typeof body?.memory === 'string' ? body.memory.slice(0, 4000) : '';

  const verdict = allow(clientIp(req), cfg.discussPerIpPerHour, cfg.perDay, talkHits);
  if (verdict !== 'ok') return void json(res, 429, { error: verdict === 'ip' ? 'rate_ip' : 'rate_day' }), true;
  if (running >= cfg.concurrency) return void json(res, 429, { error: 'busy' }), true;

  running++;
  const t0 = Date.now();
  try {
    const guest = typeof body?.guest === 'string' && parsed.lesson.cast.some((c) => c.id === body.guest) ? body.guest : undefined;
    const r = await finaleFor(cfg.client, { lesson: parsed.lesson, journey, memory, guest }, t0 + 90_000);
    console.error(`finale: ${r ? 'ok' : 'kept the original'} after ${Math.round((Date.now() - t0) / 1000)}s ${parsed.lesson.title.slice(0, 30)}`);
    json(res, 200, r ?? {});
  } catch (e) {
    upstreamFailed(res, 'finale', e);
  } finally {
    running--;
  }
  return true;
}

/** 和熟人单独聊天：交情、讲过的故事、一起闯过的需求由前端带来（只存在用户设备上） */
async function friend(req: IncomingMessage, res: ServerResponse, cfg: ReturnType<typeof settings>): Promise<boolean> {
  if (req.method !== 'POST') return void json(res, 405, { error: 'method' }), true;
  if (!cfg.client) return void json(res, 503, { error: 'disabled' }), true;
  let body: Record<string, unknown>;
  try {
    body = (await readBody(req, 48_000)) as Record<string, unknown>;
  } catch {
    return void json(res, 400, { error: 'bad_request' }), true;
  }
  if (cfg.accessCode && body?.code !== cfg.accessCode) return void json(res, 403, { error: 'code' }), true;
  const who = typeof body?.who === 'string' && charById(body.who) && body.who !== 'me' ? body.who : '';
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!who || !message || [...message].length > MAX_MESSAGE_CHARS) return void json(res, 400, { error: 'need' }), true;
  const strings = (v: unknown, n: number, len: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-n).map((x) => x.slice(0, len)) : []);
  const history: Turn[] = (Array.isArray(body.history) ? body.history : [])
    .filter((t): t is Turn => (t?.role === 'user' || t?.role === 'assistant') && typeof t?.content === 'string')
    .slice(-MAX_TURNS)
    .map((t) => ({ role: t.role, content: t.content.slice(0, 1200) }));
  while (history[0]?.role === 'assistant') history.shift();

  const verdict = allow(clientIp(req), cfg.discussPerIpPerHour, cfg.perDay, talkHits);
  if (verdict !== 'ok') return void json(res, 429, { error: verdict === 'ip' ? 'rate_ip' : 'rate_day' }), true;
  if (running >= cfg.concurrency) return void json(res, 429, { error: 'busy' }), true;
  running++;
  try {
    const r = await friendChat(cfg.client, {
      who,
      lang: body.lang === 'en' ? 'en' : 'zh',
      hearts: Math.max(0, Math.min(5, Number(body.hearts) || 0)),
      history,
      message,
      stories: strings(body.stories, 8, 160),
      quests: strings(body.quests, 10, 40),
      memory: typeof body.memory === 'string' ? body.memory.slice(0, 4000) : undefined,
      plan: typeof body.plan === 'string' ? body.plan.slice(0, MAX_PLAN_CHARS) : undefined,
    });
    if (!r) return void json(res, 502, { error: 'upstream', detail: 'refused' }), true;
    json(res, 200, r);
  } catch (e) {
    upstreamFailed(res, 'friend', e);
  } finally {
    running--;
  }
  return true;
}

/** 按需求挑最有梗的三位古典人物来客串（同一个需求只问一次模型） */
const cameoCache = new Map<string, { id: string; hook: string }[]>();
async function cameos(req: IncomingMessage, res: ServerResponse, cfg: ReturnType<typeof settings>): Promise<boolean> {
  if (req.method !== 'POST') return void json(res, 405, { error: 'method' }), true;
  if (!cfg.client) return void json(res, 503, { error: 'disabled' }), true;
  let body: { need?: unknown; lang?: unknown; code?: unknown };
  try {
    body = (await readBody(req, 4096)) as typeof body;
  } catch {
    return void json(res, 400, { error: 'bad_request' }), true;
  }
  if (cfg.accessCode && body?.code !== cfg.accessCode) return void json(res, 403, { error: 'code' }), true;
  const need = typeof body?.need === 'string' ? body.need.trim().slice(0, MAX_NEED_CHARS) : '';
  if (!need) return void json(res, 400, { error: 'need' }), true;
  const lang = body?.lang === 'en' ? 'en' : 'zh';
  const key = `${lang}:${need}`;
  if (cameoCache.has(key)) return void json(res, 200, { picks: cameoCache.get(key) }), true;
  const verdict = allow(clientIp(req), cfg.discussPerIpPerHour, cfg.perDay, talkHits);
  if (verdict !== 'ok') return void json(res, 429, { error: verdict === 'ip' ? 'rate_ip' : 'rate_day' }), true;
  running++;
  try {
    const picks = await suggestCameos(cfg.client, need, lang);
    if (picks.length) {
      cameoCache.set(key, picks);
      if (cameoCache.size > 300) cameoCache.delete(cameoCache.keys().next().value!);
    }
    json(res, 200, { picks });
  } catch (e) {
    upstreamFailed(res, 'cameos', e);
  } finally {
    running--;
  }
  return true;
}

const MAX_PLAN_CHARS = 8000;
const MAX_TURNS = 16;
const MAX_MESSAGE_CHARS = 400;

async function discuss(req: IncomingMessage, res: ServerResponse, cfg: ReturnType<typeof settings>): Promise<boolean> {
  if (req.method !== 'POST') return void json(res, 405, { error: 'method' }), true;
  if (!cfg.client) return void json(res, 503, { error: 'disabled' }), true;

  let body: { plan?: unknown; history?: unknown; message?: unknown; lang?: unknown; code?: unknown; memory?: unknown; members?: unknown; joined?: unknown };
  try {
    body = (await readBody(req, 40_000)) as typeof body;
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
  // 多人讨论：members = 在场的人（小芳、熟人、客串）；joined = 刚被请进来的那位（这时可以没有消息）
  const members: Member[] = (Array.isArray(body?.members) ? body.members : [])
    .filter((m): m is Member => typeof m?.id === 'string' && (!!cameoById(m.id) || (!!charById(m.id) && m.id !== 'me')))
    .slice(0, 8)
    .map((m) => ({ id: m.id, hearts: Math.max(0, Math.min(5, Number(m.hearts) || 0)), quests: Array.isArray(m.quests) ? m.quests.filter((q): q is string => typeof q === 'string').slice(0, 5).map((q) => q.slice(0, 40)) : [] }));
  const joined = typeof body?.joined === 'string' && members.some((m) => m.id === body.joined) ? body.joined : undefined;
  if (!plan || (!message && !joined) || [...message].length > MAX_MESSAGE_CHARS) return void json(res, 400, { error: 'need' }), true;
  const lang = body?.lang === 'en' ? 'en' : 'zh';

  const verdict = allow(clientIp(req), cfg.discussPerIpPerHour, cfg.perDay, talkHits);
  if (verdict !== 'ok') return void json(res, 429, { error: verdict === 'ip' ? 'rate_ip' : 'rate_day' }), true;
  if (running >= cfg.concurrency) return void json(res, 429, { error: 'busy' }), true;

  running++;
  try {
    const memory = typeof body?.memory === 'string' ? body.memory.slice(0, 4000) : '';
    if (members.length) {
      const replies = await groupChat(cfg.client, { plan, members, history, message, lang, memory, joined });
      if (!replies) return void json(res, 422, { error: 'refused' }), true;
      return void json(res, 200, { replies }), true;
    }
    const reply = await discussNeed(cfg.client, { plan, history, message, lang, memory });
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
