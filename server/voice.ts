import { randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Config } from './config';
import { UpstreamError } from './generate';

/**
 * 朋友在分歧处录的原声：转成文字（Groq Whisper，OpenAI 兼容接口），音频和分享存一样久（60 天）。
 * 只有拿着分享链接、知道这段原声 id 的人能听到。
 */
export type Stt = (audio: Buffer, type: string, lang: 'zh' | 'en') => Promise<string>;

export function sttFromConfig(c: Config): Stt | null {
  const s = c.stt ?? {};
  if (!s.apiKey) return null;
  const url = `${(s.baseUrl || 'https://api.groq.com/openai/v1').replace(/\/+$/, '')}/audio/transcriptions`;
  const model = s.model || 'whisper-large-v3-turbo';
  return async (audio, type, lang) => {
    const form = new FormData();
    form.set('model', model);
    form.set('response_format', 'json');
    form.set('language', lang);
    form.set('file', new Blob([audio], { type }), `voice.${EXT[type] ?? 'webm'}`);
    // Groq 的边缘节点会拒掉默认的 UA
    const res = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${s.apiKey}`, 'user-agent': 'need-quest/1.0' }, body: form, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new UpstreamError(res.status, (await res.text().catch(() => '')).slice(0, 300));
    const d = (await res.json()) as { text?: string };
    return (d.text ?? '').trim();
  };
}

/** 浏览器录音的格式：Chrome / 安卓是 webm，Safari 是 mp4 */
export const EXT: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };
export const MAX_VOICE_BYTES = 600_000;
const TTL = 60 * 86400_000;
const DIR = () => join(process.env.STATE_DIRECTORY || process.env.NEED_QUEST_DATA || join(tmpdir(), 'need-quest'), 'voices');
export const isVoiceId = (id: string) => /^[A-Za-z0-9_-]{10,20}$/.test(id);

export function saveVoice(audio: Buffer, type: string): string | null {
  const ext = EXT[type];
  if (!ext) return null;
  try {
    const dir = DIR();
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir)) if (Date.now() - statSync(join(dir, f)).mtimeMs > TTL) unlinkSync(join(dir, f));
    const id = randomBytes(9).toString('base64url');
    writeFileSync(join(dir, `${id}.${ext}`), audio, { mode: 0o600 });
    return id;
  } catch {
    return null;
  }
}

export function loadVoice(id: string): { audio: Buffer; type: string } | null {
  if (!isVoiceId(id)) return null;
  try {
    const dir = DIR();
    const f = readdirSync(dir).find((x) => x.startsWith(`${id}.`));
    if (!f) return null;
    const ext = f.slice(id.length + 1);
    const type = Object.entries(EXT).find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream';
    return { audio: readFileSync(join(dir, f)), type };
  } catch {
    return null;
  }
}
