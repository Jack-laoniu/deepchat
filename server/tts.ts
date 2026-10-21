import type { Config } from './config';
import { UpstreamError } from './generate';

/** 服务器朗读：调用 OpenAI 兼容的 /audio/speech，返回 mp3 */
export type Tts = (text: string, gender: 'f' | 'm') => Promise<Buffer>;

export function ttsFromConfig(c: Config): Tts | null {
  const t = c.tts ?? {};
  if (!t.enabled) return null;
  const apiKey = t.apiKey || c.openai?.apiKey;
  if (!apiKey) {
    console.error('tts.enabled 已打开，但没有 tts.apiKey（也没有 openai.apiKey）');
    return null;
  }
  const url = `${(t.baseUrl || c.openai?.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')}/audio/speech`;
  const model = t.model || 'gpt-4o-mini-tts';
  const voice = { f: t.voiceF || 'nova', m: t.voiceM || 'onyx' };

  // 同一句台词很多人会听到：在内存里缓存最近的一批（每句十几 KB）
  const cache = new Map<string, Promise<Buffer>>();
  return (text, gender) => {
    const key = `${gender}|${text}`;
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const p = (async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, voice: voice[gender], input: text, response_format: 'mp3' }),
      });
      if (!res.ok) throw new UpstreamError(res.status, (await res.text().catch(() => '')).slice(0, 300));
      return Buffer.from(await res.arrayBuffer());
    })();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
    return p;
  };
}
