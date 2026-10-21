import { getLang, LOCALE } from '../i18n';
import { isMuted } from './fx';

/** 浏览器自带朗读：每个角色用不同音高/语速，像听力故事一样把台词念出来 */

const voices = new Map<string, SpeechSynthesisVoice | null>();

function pickVoice(locale: string): SpeechSynthesisVoice | null {
  if (voices.has(locale)) return voices.get(locale)!;
  const vs = window.speechSynthesis?.getVoices() ?? [];
  if (!vs.length) return null; // 还没加载好，下次再找
  const v = vs.find((x) => x.lang === locale) ?? vs.find((x) => x.lang.startsWith(locale.slice(0, 2))) ?? null;
  voices.set(locale, v);
  return v;
}

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function speak(text: string, opts: { pitch?: number; rate?: number } = {}): Promise<void> {
  if (!canSpeak() || isMuted()) return Promise.resolve();
  return new Promise((resolve) => {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[\p{Extended_Pictographic}️]/gu, ''));
      const locale = LOCALE[getLang()];
      u.lang = locale;
      const v = pickVoice(locale);
      if (v) u.voice = v;
      u.pitch = opts.pitch ?? 1;
      u.rate = (opts.rate ?? 1) * 1.05;
      u.onend = u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
      // 某些环境不触发 onend，兜底
      setTimeout(resolve, 600 + text.length * (getLang() === 'zh' || getLang() === 'ja' ? 260 : 90));
    } catch {
      resolve();
    }
  });
}

export function hush() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

// ---- 语音输入（Chrome / Edge / Safari 支持；嵌入环境可能被禁用） ----

type Recognition = {
  lang: string;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

const Rec = (): (new () => Recognition) | null => {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => Recognition) | null;
};

export const canListen = () => typeof window !== 'undefined' && !!Rec();

/** 开始听写；返回停止函数。onText 会随识别进度多次回调 */
export function listen(onText: (t: string) => void, onEnd: () => void): () => void {
  const R = Rec();
  if (!R) {
    onEnd();
    return () => {};
  }
  const r = new R();
  r.lang = LOCALE[getLang()];
  r.interimResults = true;
  r.onresult = (e) => onText(Array.from(e.results).map((x) => x[0].transcript).join(''));
  r.onend = r.onerror = onEnd;
  try {
    r.start();
  } catch {
    onEnd();
  }
  return () => r.stop();
}
