import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadVoice, saveVoice, sttFromConfig } from './voice';

beforeAll(() => {
  process.env.NEED_QUEST_DATA = mkdtempSync(join(tmpdir(), 'nq-voice-'));
});
afterEach(() => vi.unstubAllGlobals());

describe('voice notes', () => {
  it('stores a clip and serves it back with its type; rejects unknown formats and bad ids', () => {
    const audio = Buffer.alloc(3000, 7);
    const id = saveVoice(audio, 'audio/mp4')!;
    expect(id).toMatch(/^[A-Za-z0-9_-]{10,20}$/);
    const back = loadVoice(id)!;
    expect(back.type).toBe('audio/mp4');
    expect(back.audio.equals(audio)).toBe(true);
    expect(saveVoice(audio, 'text/html')).toBeNull();
    expect(loadVoice('../../etc/passwd')).toBeNull();
  });

  it('transcribes through the Groq (OpenAI-compatible) endpoint with the configured key', async () => {
    expect(sttFromConfig({})).toBeNull();
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ text: ' 你就知道吃 ' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const stt = sttFromConfig({ stt: { apiKey: 'gsk_test' } })!;
    expect(await stt(Buffer.alloc(3000), 'audio/webm', 'zh')).toBe('你就知道吃');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer gsk_test');
    const form = init.body as FormData;
    expect(form.get('model')).toBe('whisper-large-v3-turbo');
    expect(form.get('language')).toBe('zh');
  });
});
