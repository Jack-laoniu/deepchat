import Anthropic from '@anthropic-ai/sdk';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { generateLesson } from './generate';

/**
 * 网页版的生成接口：
 *   GET  /api/config    → { generate: boolean }（服务器配了 API key 才能在线生成）
 *   POST /api/generate  { need, lang } → { lesson } | { error }
 *
 * 公开网站 + 按量计费，所以有几道保护：按 IP 限频、每日总量上限、并发上限、相同需求缓存。
 */

const PER_IP_PER_HOUR = Number(process.env.NEED_QUEST_IP_LIMIT) || 5;
const DAILY_LIMIT = Number(process.env.NEED_QUEST_DAILY_LIMIT) || 200;
const MAX_CONCURRENT = Number(process.env.NEED_QUEST_CONCURRENCY) || 3;
const MAX_NEED_CHARS = 200;

// ANTHROPIC_BASE_URL 设置时，SDK 会改走那个兼容 Anthropic 接口的地址（比如测试期用的中转服务）
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
/** 测试期访问码：设置后，只有带对访问码的请求才能用服务器上的 key 生成 */
const ACCESS_CODE = process.env.NEED_QUEST_ACCESS_CODE || '';

const hits = new Map<string, number[]>();
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

function allow(ip: string): 'ok' | 'ip' | 'day' {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    dayCount = 0;
  }
  if (dayCount >= DAILY_LIMIT) return 'day';
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= PER_IP_PER_HOUR) return 'ip';
  recent.push(now);
  hits.set(ip, recent);
  dayCount++;
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
  if (path === '/api/config' && req.method === 'GET') {
    json(res, 200, { generate: !!client, needCode: !!ACCESS_CODE });
    return true;
  }
  if (path !== '/api/generate') return false;
  if (req.method !== 'POST') return void json(res, 405, { error: 'method' }), true;
  if (!client) return void json(res, 503, { error: 'disabled' }), true;

  let body: { need?: unknown; lang?: unknown; code?: unknown };
  try {
    body = (await readBody(req)) as typeof body;
  } catch {
    return void json(res, 400, { error: 'bad_request' }), true;
  }
  if (ACCESS_CODE && body?.code !== ACCESS_CODE) return void json(res, 403, { error: 'code' }), true;
  const need = typeof body?.need === 'string' ? body.need.trim() : '';
  const lang = body?.lang === 'en' ? 'en' : 'zh';
  if (!need || [...need].length > MAX_NEED_CHARS) return void json(res, 400, { error: 'need' }), true;

  const key = `${lang}:${need}`;
  if (cache.has(key)) return void json(res, 200, { lesson: cache.get(key) }), true;

  const verdict = allow(clientIp(req));
  if (verdict !== 'ok') return void json(res, 429, { error: verdict === 'ip' ? 'rate_ip' : 'rate_day' }), true;
  if (running >= MAX_CONCURRENT) return void json(res, 429, { error: 'busy' }), true;

  running++;
  try {
    const r = await generateLesson(client, need, lang);
    if (!r.ok) return void json(res, 422, { error: r.error }), true;
    cache.set(key, r.lesson);
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    json(res, 200, { lesson: r.lesson });
  } catch (e) {
    console.error('generate failed:', e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
    const status = e instanceof Anthropic.RateLimitError ? 429 : 502;
    json(res, status, { error: status === 429 ? 'busy' : 'upstream' });
  } finally {
    running--;
  }
  return true;
}
