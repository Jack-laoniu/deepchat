import { getLang, LOCALE } from '../i18n';
import { loadCode, serverConfig } from '../api';
import { ac, isMuted } from './fx';

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
    ac(); // 服务器朗读走 AudioContext，同样要在点击里先建好

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

const hasBrowserTts = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
export const canSpeak = () => typeof window !== 'undefined';

/**
 * 两种念法：
 * - browser：浏览器自带朗读（iPhone、电脑、大部分带谷歌服务的安卓）
 * - server：服务器把台词转成 mp3，用和按钮音效同一个 AudioContext 播放。
 *   很多安卓机/内置浏览器没有朗读引擎或没有中英文语音，「按钮有声、台词没声」，这时自动切过来（需服务器开启 tts）
 */
let engine: 'browser' | 'server' = hasBrowserTts() ? 'browser' : 'server';

/** 浏览器语音已加载、却没有当前语言的语音 → 浏览器念不了 */
function browserLacksLang(): boolean {
  const vs = window.speechSynthesis.getVoices();
  const lang = LOCALE[getLang()].slice(0, 2);
  return vs.length > 0 && !vs.some((v) => v.lang.toLowerCase().startsWith(lang));
}

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
  if (!current) return;
  if (engine === 'server') void playServer(current, false);
  else if (browserLacksLang()) void playServer(current, true);
  else utter(current, true);
}

// ---- 服务器朗读 ----

let playing: AudioBufferSourceNode | null = null;
const audio = new Map<string, Promise<AudioBuffer | null>>();

function serverAudio(text: string, gender: Gender): Promise<AudioBuffer | null> {
  const key = `${gender}|${text}`;
  let p = audio.get(key);
  if (!p) {
    p = (async () => {
      if (!(await serverConfig()).tts) return null;
      const ctx = ac();
      if (!ctx) return null;
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, g: gender, code: loadCode() }),
      });
      if (!res.ok) return null;
      const data = await res.arrayBuffer();
      // 老安卓 WebView 只支持回调写法
      return new Promise<AudioBuffer>((ok, bad) => ctx.decodeAudioData(data, ok, bad));
    })().catch(() => null);
    p.then((b) => !b && audio.delete(key));
    audio.set(key, p);
    if (audio.size > 120) audio.delete(audio.keys().next().value!);
  }
  return p;
}

/** 提前把下一句要念的准备好（只在服务器朗读模式下有用） */
export function prefetchSpeech(text: string, opts: Opts = {}) {
  if (engine !== 'server' || isMuted()) return;
  const clean = text.replace(/[\p{Extended_Pictographic}️]/gu, '').trim();
  if (clean) void serverAudio(clean, opts.gender ?? 'f');
}

async function playServer(job: Job, browserFallback: boolean) {
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(fallback);
    if (current !== job) return;
    playing = null;
    job.done();
    next();
  };
  const fallback = setTimeout(finish, 5000 + job.text.length * (getLang() === 'zh' ? 300 : 120));
  const buf = await serverAudio(job.text, job.opts.gender ?? 'f');
  if (current !== job || finished) return;
  const ctx = ac();
  // AudioContext 被系统挂起（切后台、还没点过屏幕）时 start() 不出声也不结束，先唤醒，唤不醒就跳过这句
  if (ctx && ctx.state !== 'running') await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 400))]);
  if (current !== job || finished) return;
  if (ctx && ctx.state !== 'running') return finish();
  if (!buf || !ctx) {
    // 服务器没开朗读：还是让浏览器试一下（可能用别的语言的嗓音念）
    if (browserFallback && hasBrowserTts()) {
      finished = true;
      clearTimeout(fallback);
      return utter(job, false);
    }
    return finish();
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  // 服务器嗓音已按性别区分，这里只轻微变速，让不同角色听起来有点差别
  src.playbackRate.value = 1 + ((job.opts.rate ?? 1) - 1) * 0.3;
  src.connect(ctx.destination);
  src.onended = finish;
  playing = src;
  src.start();
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
    if (!started && unlocked) return toServer(); // 安卓上常见：没有朗读引擎，直接报 synthesis-failed
    finish();
  };
  const toServer = () => {
    finished = true;
    clearTimeout(watchdog);
    clearTimeout(fallback);
    synth.cancel();
    engine = 'server';
    if (current === job) void playServer(job, false);
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
  // 1.5 秒还没开口：有指定嗓音就换一个；连系统默认都不出声，说明这个浏览器念不了，改用服务器朗读
  const watchdog = setTimeout(() => {
    if (started || finished || !unlocked || startEvents === false) return;
    if (v) return retry();
    toServer();
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
    playing?.stop();
  } catch {
    /* 已经播完 */
  }
  playing = null;
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
