import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import farm from '../src/lessons/farm.json';

// 用临时配置文件：主模型 + 备用模型，接口用假的 fetch
const dir = mkdtempSync(join(tmpdir(), 'nq-api-'));
const cfgPath = join(dir, 'config.json');
process.env.NEED_QUEST_CONFIG = cfgPath;
writeFileSync(cfgPath, JSON.stringify({ provider: 'openai', openai: { apiKey: 'k', baseUrl: 'https://relay.example/v1', model: 'main', fallbackModel: 'backup' }, limits: { perIpPerHour: 100 } }));

let behaviour: Record<string, 'ok' | 'down'> = {};
const sse = (text: string) => new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
  const model = JSON.parse(init.body as string).model as string;
  return behaviour[model] === 'ok' ? sse(JSON.stringify(farm)) : new Response('upstream exploded', { status: 500 });
});

const post = (port: number, body: unknown) =>
  new Promise<any>((resolve) => {
    const req = request({ port, path: '/api/generate', method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => resolve({ status: res.statusCode, ...JSON.parse(b) }));
    });
    req.end(JSON.stringify(body));
  });

describe('generate endpoint fallback chain', async () => {
  const { handleApi } = await import('./api');
  const srv = createServer((req, res) => void handleApi(req, res, req.url!));
  let port = 0;
  beforeAll(() => new Promise<void>((r) => srv.listen(0, () => ((port = (srv.address() as any).port), r()))));
  afterAll(() => srv.close());

  it('uses the backup model when the main one is down', async () => {
    behaviour = { main: 'down', backup: 'ok' };
    const r = await post(port, { need: '农场浇水 A', lang: 'zh' });
    expect(r.status).toBe(200);
    expect(r.generic).toBeUndefined();
    expect(r.lesson.title).toBe(farm.title);
  });

  it('serves the generic level when every model fails, instead of an error', async () => {
    behaviour = { main: 'down', backup: 'down' };
    const r = await post(port, { need: '给孕妇选择月子中心还是请月嫂', lang: 'zh' });
    expect(r.status).toBe(200);
    expect(r.generic).toBe(true);
    expect(r.lesson.domain).toBe('generic');
    expect(r.lesson.need).toContain('月子');
  });
});
