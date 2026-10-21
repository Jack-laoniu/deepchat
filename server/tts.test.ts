import { afterEach, describe, expect, it, vi } from 'vitest';
import { ttsFromConfig } from './tts';

describe('server tts', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is off unless enabled, and reuses the openai key and base url', async () => {
    expect(ttsFromConfig({ openai: { apiKey: 'k' } })).toBeNull();
    const seen: any[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      seen.push({ url, body: JSON.parse(init.body as string), auth: (init.headers as any).authorization });
      return new Response(new Uint8Array([1, 2, 3]));
    });
    const tts = ttsFromConfig({ openai: { apiKey: 'k', baseUrl: 'https://agy.example/v1/' }, tts: { enabled: true } })!;
    expect([...(await tts('你好', 'm'))]).toEqual([1, 2, 3]);
    await tts('你好', 'm'); // 第二次走缓存
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ url: 'https://agy.example/v1/audio/speech', auth: 'Bearer k', body: { voice: 'onyx', input: '你好', response_format: 'mp3' } });
  });
});
