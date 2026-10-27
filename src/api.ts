import { useEffect, useState } from 'react';
import { getLang, t, type MsgKey } from './i18n';
import { parseLesson, type BossRound, type Lesson } from './lesson/schema';
import { memoryText } from './memory';
import type { Pick } from './lesson/picks';

export type ServerConfig = { generate: boolean; needCode: boolean; tts: boolean };

/** 服务端有没有配 API key（网页版能不能在线生成）。整页只问一次 */
let configOnce: Promise<ServerConfig> | null = null;
export const serverConfig = () =>
  (configOnce ??= fetch('/api/config')
    .then((r) => (r.ok ? r.json() : {}))
    .then((d: { generate?: boolean; needCode?: boolean; tts?: boolean }) => ({ generate: !!d.generate, needCode: !!d.needCode, tts: !!d.tts }))
    .catch(() => ({ generate: false, needCode: false, tts: false })));

export function useCanGenerate() {
  const [cfg, setCfg] = useState<ServerConfig | null>(null);
  useEffect(() => {
    let alive = true;
    void serverConfig().then((c) => alive && setCfg(c));
    return () => {
      alive = false;
    };
  }, []);
  return cfg;
}

const CODE_KEY = 'need-quest-code';
export const loadCode = () => {
  try {
    return localStorage.getItem(CODE_KEY) ?? '';
  } catch {
    return '';
  }
};
export const saveCode = (c: string) => {
  try {
    localStorage.setItem(CODE_KEY, c);
  } catch {
    /* 隐私模式下存不了，下次重新输入 */
  }
};

const ERRORS: Record<string, MsgKey> = { code: 'genCode', rate_ip: 'genRate', rate_day: 'genRate', busy: 'genBusy' };

/** 在线生成关卡；context = 上一关的结果（再玩一轮时） */
const RETRIES = 3;

export async function requestLesson(
  need: string,
  opts: { context?: string; avoid?: string[]; signal?: AbortSignal } = {},
): Promise<{ lesson: Lesson } | { error: string }> {
  // 服务器最多花 5 分钟（含备用模型和兜底），这边多等一点再放弃
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 330_000);
  opts.signal?.addEventListener('abort', () => ctrl.abort());
  // memory：这台设备上记住的、用户以前闯过的需求（角色会记得）
  const body = JSON.stringify({ need, lang: getLang() === 'en' ? 'en' : 'zh', code: loadCode(), context: opts.context, avoid: opts.avoid, memory: memoryText(need) || undefined });
  // 连接中途断了（手机切后台、网关超时）：服务器那边还在生成，重新连上会直接等那一份或拿缓存，不会重新生成
  const send = async (): Promise<Response> => {
    for (let i = 0; ; i++) {
      try {
        const res = await fetch('/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: ctrl.signal });
        if ((res.status === 502 || res.status === 504) && i < RETRIES) throw new Error(`HTTP ${res.status}`);
        return res;
      } catch (e) {
        if (ctrl.signal.aborted || i >= RETRIES) throw e;
        await new Promise((ok) => setTimeout(ok, 1500 * (i + 1)));
      }
    }
  };
  try {
    const res = await send();
    const data = (await res.json().catch(() => ({}))) as { lesson?: unknown; error?: string; detail?: string };
    const r = data.lesson ? parseLesson(data.lesson) : null;
    if (r?.ok) return { lesson: r.lesson };
    if (data.error === 'upstream') return { error: t('genUpstream', { d: data.detail ?? '?' }) };
    if (data.error === 'invalid') return { error: t('genInvalid') };
    if (!data.error) return { error: t('genUpstream', { d: `HTTP ${res.status}` }) }; // 代理/网关自己报的错（如超时）
    return { error: t(ERRORS[data.error] ?? 'genFail') };
  } catch {
    return { error: opts.signal?.aborted ? '' : ctrl.signal.aborted ? t('genTimeout') : t('genFail') };
  } finally {
    clearTimeout(timer);
  }
}

/** 角色对用户自己打的字做出回应；失败或超时返回 null（调用方退回预设台词） */
export async function requestReact(input: {
  need: string;
  who: string;
  as?: string;
  q: string;
  options: string[];
  text: string;
  recent: string[];
}): Promise<{ say: string; mood?: string } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch('/api/react', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...input, lang: getLang() === 'en' ? 'en' : 'zh', code: loadCode() }),
      signal: ctrl.signal,
    });
    const d = (await res.json().catch(() => ({}))) as { say?: string; mood?: string };
    return res.ok && d.say ? { say: d.say, mood: d.mood } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 个性化终章：把这一局到目前为止的选择和原话发给服务器，换回按用户写的终章。
 * 后台进行，失败或超时返回 null（用关卡里原来的终章）。
 */
export async function requestFinale(lesson: Lesson, journey: string, guest?: string | null, signal?: AbortSignal): Promise<{ boss: BossRound; cast: Lesson['cast'] } | null> {
  try {
    const res = await fetch('/api/finale', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lesson, journey, guest: guest ?? undefined, code: loadCode(), memory: memoryText(lesson.need) || undefined }),
      signal: AbortSignal.any ? AbortSignal.any([AbortSignal.timeout(100_000), ...(signal ? [signal] : [])]) : signal,
    });
    const data = (await res.json().catch(() => ({}))) as { boss?: BossRound; cast?: Lesson['cast'] };
    return res.ok && data.boss && Array.isArray(data.cast) ? { boss: data.boss, cast: data.cast } : null;
  } catch {
    return null;
  }
}

/** 和熟人单独聊天；失败返回错误码 */
export async function requestFriend(input: {
  who: string;
  hearts: number;
  history: { role: 'user' | 'assistant'; content: string }[];
  message: string;
  stories: string[];
  quests: string[];
  plan?: string;
}): Promise<{ reply: string; story?: string } | { error: string }> {
  try {
    const res = await fetch('/api/friend', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...input, lang: getLang() === 'en' ? 'en' : 'zh', code: loadCode(), memory: memoryText() || undefined }),
      signal: AbortSignal.timeout(90_000),
    });
    const d = (await res.json().catch(() => ({}))) as { reply?: string; story?: string; error?: string };
    return d.reply ? { reply: d.reply, story: d.story } : { error: d.error ?? 'fail' };
  } catch {
    return { error: 'fail' };
  }
}

/** 客人插话：失败返回 null（就不插了） */
type ChimeInput = {
  need: string;
  who: string;
  hearts?: number;
  joined: boolean;
  recent: string[];
  pending?: string;
  others: { id: string; name: string }[];
};
type ChimeLines = { who: string; say: string; mood?: string }[] | null;

/**
 * 熟人的「影子后台」：对话进行时，提前替最可能被请来的客人把进场的话准备好；
 * 用户真把他请进来时直接用，不用再等模型。准备好的话只在同一段对话、往后不超过 6 句内有效。
 */
const ready = new Map<string, { shown: number; at: number; lines: Promise<ChimeLines> }>();
/** 眼前这段对话的快照：邀请面板打开时，用它给面板上的人提前准备 */
export let scene: { key: string; shown: number; input: Omit<ChimeInput, 'who' | 'hearts' | 'joined'> } | null = null;
export const setScene = (s: typeof scene) => void (scene = s);

export function prefetchChime(key: string, shown: number, input: ChimeInput) {
  const k = `${key}|${input.who}`;
  const old = ready.get(k);
  if (old && shown - old.shown <= 3) return;
  ready.set(k, { shown, at: Date.now(), lines: requestChime(input) });
}

/** 看一眼准备好了没有（不拿走）：用来决定要不要「敲门」 */
export const peekChime = (key: string, who: string): Promise<ChimeLines> | null => ready.get(`${key}|${who}`)?.lines ?? null;

/** 敲门的规则：第一次通关后告诉用户；之后交情够的熟人和对得上需求的名著人物会主动敲门。每关每人最多敲一次 */
const RULE = 'need-quest-knock-rule';
export const knockRuleSeen = () => {
  try {
    return localStorage.getItem(RULE) === '1';
  } catch {
    return false;
  }
};
export const markKnockRule = () => {
  try {
    localStorage.setItem(RULE, '1');
  } catch {
    /* 存不了就下次再说 */
  }
};
const knocked = new Map<string, Set<string>>();
export const knockedIn = (lesson: string) => knocked.get(lesson) ?? knocked.set(lesson, new Set()).get(lesson)!;

/** 拿准备好的话（拿了就删）；没有或过期了返回 null */
export function takeChime(key: string, who: string, shown: number): Promise<ChimeLines> | null {
  const k = `${key}|${who}`;
  const r = ready.get(k);
  ready.delete(k);
  return r && shown - r.shown <= 6 && Date.now() - r.at < 180_000 ? r.lines : null;
}

/** 按需求推荐的名著人物（邀请面板和影子后台共用，同一个需求只问一次） */
const picksOf = new Map<string, Promise<{ id: string; hook: string }[]>>();
export function cameoPicks(need: string): Promise<{ id: string; hook: string }[]> {
  const k = `${getLang()}|${need}`;
  if (!picksOf.has(k))
    picksOf.set(
      k,
      fetch('/api/cameos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ need, lang: getLang() === 'en' ? 'en' : 'zh', code: loadCode() }) })
        .then((r) => r.json())
        .then((d: { picks?: { id: string; hook: string }[] }) => d.picks ?? [])
        .catch(() => []),
    );
  return picksOf.get(k)!;
}

export async function requestChime(input: ChimeInput): Promise<ChimeLines> {
  try {
    const res = await fetch('/api/chime', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...input, lang: getLang() === 'en' ? 'en' : 'zh', code: loadCode() }),
    });
    const d = (await res.json().catch(() => ({}))) as { lines?: { who: string; say: string; mood?: string }[] };
    return res.ok && d.lines?.length ? d.lines : null;
  } catch {
    return null;
  }
}

// ---------------- 分享给真实的朋友 ----------------

export type Choice = 'mine' | 'theirs' | 'both';
/** decisions：分享的人对每个分歧点拍的板（key 是选择的 key） */
export type ShareReply = { at: string; rid?: string; role: 'companion' | 'advisor'; name: string; picks: Pick[]; plan: string; decisions?: Record<string, Choice>; decidedAt?: string };
export type ShareData = { at: string; role: 'companion' | 'advisor'; from: string; lesson: Lesson; picks: Pick[]; replies: ShareReply[] };

/** 我分享出去的行程（这台设备上记着，首页用来看朋友有没有回复） */
const MINE = 'need-quest-shares';
export type MyShare = { id: string; title: string; role: 'companion' | 'advisor'; at: number; seen: number; owner?: string };
export const myShares = (): MyShare[] => {
  try {
    return JSON.parse(localStorage.getItem(MINE) ?? '[]') as MyShare[];
  } catch {
    return [];
  }
};
export const saveMyShares = (list: MyShare[]) => {
  try {
    localStorage.setItem(MINE, JSON.stringify(list.slice(0, 10)));
  } catch {
    /* 存不了就算了 */
  }
};

export async function createShare(role: 'companion' | 'advisor', from: string, lesson: Lesson, picks: Pick[]): Promise<string | null> {
  try {
    const res = await fetch('/api/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role, from, lesson, picks }) });
    const d = (await res.json().catch(() => ({}))) as { id?: string; owner?: string };
    if (!res.ok || !d.id) return null;
    saveMyShares([{ id: d.id, title: lesson.title, role, at: Date.now(), seen: 0, owner: d.owner }, ...myShares()]);
    return d.id;
  } catch {
    return null;
  }
}

export async function getShare(id: string): Promise<ShareData | null> {
  try {
    const res = await fetch(`/api/share?id=${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const d = (await res.json()) as ShareData;
    const l = parseLesson(d.lesson);
    return l.ok ? { ...d, lesson: l.lesson } : null;
  } catch {
    return null;
  }
}

/** 我交回过的分享（分享 id → 我那条回复的 id），回头打开链接能看到对方怎么拍板 */
const REPLIED = 'need-quest-replied';
export const myReplies = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(REPLIED) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
};

export async function replyShare(id: string, role: 'companion' | 'advisor', name: string, picks: Pick[], plan: string): Promise<boolean> {
  try {
    const res = await fetch('/api/share/reply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, role, name, picks, plan }) });
    const d = (await res.json().catch(() => ({}))) as { rid?: string };
    if (res.ok && d.rid) {
      try {
        localStorage.setItem(REPLIED, JSON.stringify({ ...myReplies(), [id]: d.rid }));
      } catch {
        /* 记不住就看不到拍板结果，不影响交回 */
      }
    }
    return res.ok;
  } catch {
    return false;
  }
}

/** 分享的人拍板：和这位朋友的每个分歧点听谁的 */
export async function decideShare(id: string, rid: string, decisions: Record<string, Choice>): Promise<boolean> {
  const owner = myShares().find((m) => m.id === id)?.owner;
  if (!owner) return false;
  try {
    const res = await fetch('/api/share/decide', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, owner, rid, decisions }) });
    return res.ok;
  } catch {
    return false;
  }
}
