import { getLang, LOCALE } from '../i18n';
import { isMuted } from './fx';

/** 浏览器自带朗读：每个角色用不同音高/语速，像听力故事一样把台词念出来 */

/**
 * 选嗓音。苹果设备的英文列表里混着一批「搞怪语音」（Bad News、Bells、Zarvox…会唱歌或像机器人），
 * 直接取第一个英文语音很容易选中它们，所以按质量打分，并按角色性别挑男声/女声。
 */
type Gender = 'f' | 'm';
const NOVELTY = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|fred|kathy|deranged|hysterical|pipe organ)\b/i;
const ROBOTIC = /^(eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/i;
const PREFERRED: Record<string, Record<Gender, RegExp>> = {
  en: {
    f: /samantha|karen|moira|tessa|serena|allison|ava|susan|victoria|zira|aria|jenny|google us english|female/i,
    m: /daniel|alex|aaron|arthur|oliver|tom|david|mark|guy|google uk english male|male/i,
  },
  zh: {
    f: /ting|meijia|mei-jia|yu-shu|lili|xiaoxiao|huihui|yaoyao|xiaoyi|普通话|female/i,
    m: /li-mu|yunxi|kangkang|yunyang|yunjian|male/i,
  },
};

let cache = new Map<string, SpeechSynthesisVoice | null>();
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  // iOS / Chrome 的语音列表是异步加载的，加载完要重新挑
  window.speechSynthesis.addEventListener?.('voiceschanged', () => (cache = new Map()));
}

export function pickVoice(locale: string, gender: Gender): SpeechSynthesisVoice | null {
  const key = `${locale}:${gender}`;
  if (cache.has(key)) return cache.get(key)!;
  const vs = window.speechSynthesis?.getVoices() ?? [];
  if (!vs.length) return null; // 还没加载好，下次再找
  const lang = locale.slice(0, 2);
  const pref = PREFERRED[lang];
  const score = (v: SpeechSynthesisVoice) => {
    const name = v.name.replace(/\s*\(.*\)\s*/, (m) => (/(enhanced|premium)/i.test(m) ? ' premium ' : ' '));
    let sc = 0;
    if (NOVELTY.test(v.name)) sc -= 100;
    if (ROBOTIC.test(v.name)) sc -= 20;
    if (/premium|enhanced|natural|neural/i.test(v.name)) sc += 30;
    if (pref?.[gender].test(name)) sc += 20;
    else if (pref?.[gender === 'f' ? 'm' : 'f'].test(name)) sc -= 5;
    if (v.lang.replace('_', '-') === locale) sc += 10;
    if (v.localService) sc += 2;
    return sc;
  };
  const candidates = vs.filter((v) => v.lang.toLowerCase().startsWith(lang));
  const best = candidates.sort((a, b) => score(b) - score(a))[0] ?? null;
  const v = best && score(best) > -50 ? best : null;
  cache.set(key, v);
  return v;
}

/** 英文整体语速（1 = 系统默认） */
export const EN_RATE = 0.88;

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function speak(text: string, opts: { pitch?: number; rate?: number; gender?: Gender } = {}): Promise<void> {
  if (!canSpeak() || isMuted()) return Promise.resolve();
  return new Promise((resolve) => {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[\p{Extended_Pictographic}️]/gu, ''));
      const locale = LOCALE[getLang()];
      u.lang = locale;
      const v = pickVoice(locale, opts.gender ?? 'f');
      if (v) u.voice = v;
      // 已经按性别选了嗓音，音高只做轻微区分，避免变成「花栗鼠」或「怪兽」声
      u.pitch = 1 + ((opts.pitch ?? 1) - 1) * 0.45;
      // 中文语音偏慢，稍微加快；英文语音（尤其 iPhone）本身就快，角色差异减半再整体放慢，免得听不清
      const r = opts.rate ?? 1;
      u.rate = getLang() === 'zh' ? r * 1.05 : (1 + (r - 1) * 0.5) * EN_RATE;
      u.onend = u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
      // 某些环境不触发 onend，兜底
      setTimeout(resolve, 600 + text.length * (getLang() === 'zh' || getLang() === 'ja' ? 260 : 110));
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
