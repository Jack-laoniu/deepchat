import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** 假的朗读引擎：记录每一句，由测试决定什么时候「开口」和「念完」 */
type U = { text: string; voice: { name: string } | null; onstart?: () => void; onend?: () => void; onerror?: (e: unknown) => void };
const spoken: U[] = [];
/** 引擎自己报告的「正在念」（手机上第一句 onstart 很晚，但 speaking 已经是 true） */
const engine = { speaking: false, pending: false };
const voices = [
  { name: 'Samantha (Enhanced)', lang: 'en-US', localService: true, voiceURI: 'sam-enh', default: false },
  { name: 'Samantha', lang: 'en-US', localService: true, voiceURI: 'sam', default: false },
];
vi.stubGlobal('window', {
  speechSynthesis: {
    getVoices: () => voices,
    addEventListener: () => {},
    speak: (u: U) => spoken.push(u),
    cancel: () => {},
    resume: () => {},
    get speaking() {
      return engine.speaking;
    },
    get pending() {
      return engine.pending;
    },
  },
});
// 记下页面的点击监听，测试里模拟「用户点了一下」
const taps: (() => void)[] = [];
vi.stubGlobal('document', { addEventListener: (_: string, fn: () => void) => taps.push(fn) });
vi.stubGlobal(
  'SpeechSynthesisUtterance',
  class {
    voice = null;
    constructor(public text: string) {}
  },
);

describe('speech queue', async () => {
  const { setLocale } = await import('../i18n');
  const { speak, hush } = await import('./voice');
  beforeEach(() => {
    vi.useFakeTimers();
    setLocale('en', 'USD');
    spoken.length = 0;
  });
  afterEach(() => {
    hush();
    vi.useRealTimers();
  });

  it('reads lines one after another instead of cutting the previous one off', async () => {
    const order: string[] = [];
    void speak('first line').then(() => order.push('first'));
    void speak('second line').then(() => order.push('second'));
    expect(spoken.map((u) => u.text)).toEqual(['first line']);
    spoken[0].onstart?.();
    spoken[0].onend?.();
    await Promise.resolve();
    expect(spoken.map((u) => u.text)).toEqual(['first line', 'second line']);
    spoken[1].onstart?.();
    spoken[1].onend?.();
    await Promise.resolve();
    expect(order).toEqual(['first', 'second']);
  });

  it('switches away from a voice that never makes a sound', async () => {
    taps.forEach((f) => f()); // 用户点过屏幕，朗读已解锁
    spoken.length = 0;
    void speak('hello there');
    spoken[0].onstart?.(); // 先证明这个浏览器会报 onstart
    spoken[0].onend?.();
    await Promise.resolve();
    spoken.length = 0;

    void speak('are you there');
    expect(spoken[0].voice?.name).toBe('Samantha (Enhanced)');
    vi.advanceTimersByTime(2600); // 一直没开口
    expect(spoken[1].text).toBe('are you there');
    expect(spoken[1].voice?.name).toBe('Samantha');
  });

  it('does not read a line twice when the voice is already playing but reports it late', async () => {
    taps.forEach((f) => f());
    void speak('hello there');
    spoken[0].onstart?.();
    spoken[0].onend?.();
    await Promise.resolve();
    spoken.length = 0;

    void speak('first line of the level');
    engine.speaking = true; // 已经出声了，onstart 还没来
    vi.advanceTimersByTime(2600);
    engine.speaking = false;
    expect(spoken).toHaveLength(1);
  });

  it('hush resolves everything that was waiting', async () => {
    const done: string[] = [];
    void speak('a').then(() => done.push('a'));
    void speak('b').then(() => done.push('b'));
    hush();
    await Promise.resolve();
    expect(done.sort()).toEqual(['a', 'b']);
  });
});
