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
/** 列表里有、但实际念不出声的语音（iPhone 上部分「增强/Siri」语音在网页里是哑的） */
const mute = new Set<string>();
/** 已经在用户点击里「解锁」过朗读 */
let unlocked = false;
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  // iOS / Chrome 的语音列表是异步加载的，加载完要重新挑
  window.speechSynthesis.addEventListener?.('voiceschanged', () => (cache = new Map()));
  // iPhone 只允许在用户点击里发出第一声；之后程序自动念才有声音。
  // 有的关卡一开场就自动念台词（不是点出来的），所以在第一次点击时先念一句空白把它解锁
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  };
  for (const ev of ['touchend', 'click', 'keydown']) if (typeof document !== 'undefined') document.addEventListener(ev, unlock, { capture: true, passive: true });
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
  const candidates = vs.filter((v) => v.lang.toLowerCase().startsWith(lang) && !mute.has(v.voiceURI));
  const best = candidates.sort((a, b) => score(b) - score(a))[0] ?? null;
  const v = best && score(best) > -50 ? best : null;
  cache.set(key, v);
  return v;
}

/** 英文整体语速（1 = 系统默认） */
export const EN_RATE = 0.88;

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

type Opts = { pitch?: number; rate?: number; gender?: Gender };
type Job = { text: string; opts: Opts; done: () => void };

/**
 * 台词排队念：上一句念完才念下一句，不会互相打断。
 * speak() 返回的 Promise 在这一句念完（或被 hush 清掉）时结束。
 */
const queue: Job[] = [];
let current: Job | null = null;
/** 这个浏览器会不会触发 onstart（不会的话就没法判断「哑语音」，只能照常念） */
let startEvents: boolean | null = null;

export function speak(text: string, opts: Opts = {}): Promise<void> {
  if (!canSpeak() || isMuted()) return Promise.resolve();
  const clean = text.replace(/[\p{Extended_Pictographic}️]/gu, '').trim();
  if (!clean) return Promise.resolve();
  return new Promise((done) => {
    queue.push({ text: clean, opts, done });
    if (!current) next();
  });
}

/** 用户点头像重听：清掉排队的，马上念这一句 */
export function speakNow(text: string, opts: Opts = {}): Promise<void> {
  hush();
  return speak(text, opts);
}

function next() {
  current = queue.shift() ?? null;
  if (current) utter(current, true);
}

function utter(job: Job, withVoice: boolean) {
  const synth = window.speechSynthesis;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(watchdog);
    clearTimeout(fallback);
    if (current !== job) return; // 已被 hush 清掉
    job.done();
    next();
  };
  const u = new SpeechSynthesisUtterance(job.text);
  const locale = LOCALE[getLang()];
  u.lang = locale;
  const v = withVoice ? pickVoice(locale, job.opts.gender ?? 'f') : null;
  if (v) u.voice = v;
  // 已经按性别选了嗓音，音高只做轻微区分，避免变成「花栗鼠」或「怪兽」声
  u.pitch = 1 + ((job.opts.pitch ?? 1) - 1) * 0.45;
  // 中文语音偏慢，稍微加快；英文语音（尤其 iPhone）本身就快，角色差异减半再整体放慢，免得听不清
  const r = job.opts.rate ?? 1;
  u.rate = getLang() === 'zh' ? r * 1.05 : (1 + (r - 1) * 0.5) * EN_RATE;
  let started = false;
  u.onstart = () => {
    started = true;
    startEvents = true;
  };
  u.onend = () => {
    if (finished) return;
    // 念完了却从没报过 onstart：这个浏览器不报这个事件，之前「哑」的判断不可信，撤销
    if (!started && startEvents !== true) {
      startEvents = false;
      mute.clear();
      cache = new Map();
    }
    finish();
  };
  u.onerror = (e) => {
    if (finished) return;
    // 被我们自己 cancel 的不算
    if ((e as SpeechSynthesisErrorEvent).error === 'interrupted' || (e as SpeechSynthesisErrorEvent).error === 'canceled') return finish();
    if (v && !started) return retry();
    finish();
  };
  const retry = () => {
    finished = true;
    clearTimeout(watchdog);
    clearTimeout(fallback);
    if (v) {
      mute.add(v.voiceURI);
      cache = new Map();
    }
    synth.cancel();
    if (current === job) utter(job, !!v && mute.size < 6); // 换下一个嗓音；试了好几个都哑就交给系统默认
  };
  // 1.5 秒还没开口：这个嗓音多半是哑的，换一个
  const watchdog = setTimeout(() => {
    if (!started && !finished && v && unlocked && startEvents !== false) retry();
  }, 1500);
  // 某些环境不触发 onend，兜底
  const fallback = setTimeout(finish, 1500 + job.text.length * (getLang() === 'zh' || getLang() === 'ja' ? 300 : 120));
  try {
    synth.resume(); // iOS 有时卡在暂停状态
    synth.speak(u);
  } catch {
    finish();
  }
}

export function hush() {
  const pending = queue.splice(0);
  const cur = current;
  current = null;
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
  cur?.done();
  pending.forEach((j) => j.done());
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
