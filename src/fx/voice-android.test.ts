import { describe, expect, it, vi } from 'vitest';

// 模拟「按钮有声、台词没声」的安卓：有 speechSynthesis，但没有任何语音，speak 什么也不发生
const calls: string[] = [];
const taps: (() => void)[] = [];
let started = 0;
vi.stubGlobal('window', { speechSynthesis: { getVoices: () => [], addEventListener: () => {}, speak: () => {}, cancel: () => {}, resume: () => {} } });
vi.stubGlobal('document', { addEventListener: (_: string, fn: () => void) => taps.push(fn) });
vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
vi.stubGlobal(
  'AudioContext',
  class {
    state = 'running';
    currentTime = 0;
    destination = {};
    decodeAudioData(_d: ArrayBuffer, ok: (b: object) => void) {
      ok({});
    }
    createBufferSource() {
      const src = { playbackRate: { value: 1 }, connect: () => {}, onended: null as null | (() => void), start: () => { started++; setTimeout(() => src.onended?.(), 10); }, stop: () => {} };
      return src;
    }
  },
);
vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
  calls.push(init?.body ? `${url} ${init.body}` : url);
  if (url === '/api/config') return new Response(JSON.stringify({ generate: true, tts: true }));
  return new Response(new ArrayBuffer(8), { headers: { 'content-type': 'audio/mpeg' } });
});

describe('android without a speech engine', async () => {
  const { setLocale } = await import('../i18n');
  const { speak } = await import('./voice');

  it('falls back to server speech after the first silent line, and keeps using it', async () => {
    setLocale('zh', 'CNY');
    taps.forEach((f) => f());
    await speak('你好，我是小芳', { gender: 'f' });
    expect(started).toBe(1);
    expect(calls.some((c) => c.startsWith('/api/tts') && c.includes('你好'))).toBe(true);

    await speak('第二句', { gender: 'm' });
    expect(started).toBe(2);
    expect(calls.at(-1)).toContain('"g":"m"');
  }, 10_000);
});
