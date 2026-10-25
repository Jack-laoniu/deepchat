import { CHARACTERS } from './chars/library';
import type { Played } from './lesson/engine';
import { asksOf, beatsOf, type Lesson } from './lesson/schema';
import { memoryOn } from './memory';

/**
 * 和角色的交情（养成）：一起闯关、用自己的话回答他、回来找他聊，交情就涨。
 * - 1 颗心：可以单独找他聊天（他站在你的角度关心你，记得你说过的事）
 * - 2 颗心起：聊天时他会慢慢讲自己的故事（每多一颗心多讲一段）
 * - 2 颗心起：在别的需求里他没出场，可以把他叫进来一起帮你分析
 * 只记在这台设备上；关掉「记忆」时不保存聊天记录，但交情照算。
 */

export type ChatTurn = { role: 'user' | 'assistant'; content: string };
export type Bond = {
  xp: number;
  /** 一起闯过的需求（标题） */
  quests: string[];
  /** 最近的聊天（关掉记忆时不存） */
  chat: ChatTurn[];
  /** 已经讲过的自己的故事（一句话概要，保持前后一致） */
  stories: string[];
};

const KEY = 'need-quest-bonds';
/** 每颗心需要的累计交情 */
const HEART_XP = [2, 5, 9, 14, 20];
export const CHAT_AT = 1;
export const INVITE_AT = 2;
export const MAX_HEARTS = HEART_XP.length;

const empty = (): Bond => ({ xp: 0, quests: [], chat: [], stories: [] });

function readAll(): Record<string, Bond> {
  try {
    const v = localStorage.getItem(KEY);
    return v ? (JSON.parse(v) as Record<string, Bond>) : {};
  } catch {
    return {};
  }
}
function writeAll(all: Record<string, Bond>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* 隐私模式 / 存满了 */
  }
}

export const bondOf = (id: string): Bond => ({ ...empty(), ...readAll()[id] });
export const heartsOf = (xp: number) => HEART_XP.filter((x) => xp >= x).length;
/** 还差多少交情到下一颗心（满了返回 0） */
export const toNextHeart = (xp: number) => (HEART_XP.find((x) => xp < x) ?? xp) - xp;

/** 认识的角色（交情 > 0），交情高的在前 */
export function friends(): { id: string; bond: Bond; hearts: number }[] {
  const all = readAll();
  return CHARACTERS.filter((c) => (all[c.id]?.xp ?? 0) > 0)
    .map((c) => ({ id: c.id, bond: { ...empty(), ...all[c.id] }, hearts: heartsOf(all[c.id].xp) }))
    .sort((a, b) => b.bond.xp - a.bond.xp);
}

function update(id: string, f: (b: Bond) => Bond) {
  const all = readAll();
  all[id] = f({ ...empty(), ...all[id] });
  writeAll(all);
}

/** 一局里每个角色得到的交情：出场 +1，用户用自己的话回答他（每句 +1，最多 2），主持终章且用户认可了他的判断 +1，被请来帮忙 +2 */
export function gainsOf(lesson: Lesson, p: Played, guest?: string | null): Record<string, number> {
  const visited = new Set(p.visited);
  const gains: Record<string, number> = {};
  const add = (id: string | undefined, n: number) => {
    if (!id || id === 'me' || id === 'narrator' || !CHARACTERS.some((c) => c.id === id)) return;
    gains[id] = (gains[id] ?? 0) + n;
  };
  const met = new Set<string>();
  const asker = new Map<string, string>();
  for (const r of lesson.rounds) {
    if (!visited.has(r.id)) continue;
    for (const b of beatsOf(r)) if ('who' in b && b.who) met.add(b.who);
    for (const a of asksOf(r)) asker.set(a.q, a.who);
    if (r.type === 'map') r.spots.forEach((s) => met.add(s.who));
    if (r.type === 'chain') r.cards.forEach((c) => met.add(c.who));
    if (r.type === 'talk' && r.with) met.add(r.with);
    if (r.type === 'boss' && r.who) {
      met.add(r.who);
      if (p.portrait.some((x) => x.ok)) add(r.who, 1);
    }
  }
  met.forEach((id) => add(id, 1));
  const said: Record<string, number> = {};
  for (const q of p.quotes) {
    const who = asker.get(q.q);
    if (!who || (said[who] ?? 0) >= 2) continue;
    said[who] = (said[who] ?? 0) + 1;
    add(who, 1);
  }
  if (guest) add(guest, 2);
  return gains;
}

/** 通关时记下交情；返回每个角色的前后心数（结算页用来播动画） */
export function earn(lesson: Lesson, p: Played, guest?: string | null): { id: string; before: number; after: number; gain: number }[] {
  const gains = gainsOf(lesson, p, guest);
  return Object.entries(gains).map(([id, gain]) => {
    const before = bondOf(id).xp;
    update(id, (b) => ({ ...b, xp: b.xp + gain, quests: [lesson.title, ...b.quests.filter((q) => q !== lesson.title)].slice(0, 10) }));
    return { id, before: heartsOf(before), after: heartsOf(before + gain), gain };
  });
}

/** 聊天记录：每聊一轮 +1 交情（同一天最多 +3，不能刷） */
export function saveChat(id: string, turns: ChatTurn[], story?: string) {
  const today = new Date().toISOString().slice(0, 10);
  const dayKey = `need-quest-bond-day-${id}`;
  let n = 0;
  try {
    const v = JSON.parse(localStorage.getItem(dayKey) ?? 'null') as { d: string; n: number } | null;
    n = v?.d === today ? v.n : 0;
    localStorage.setItem(dayKey, JSON.stringify({ d: today, n: n + 1 }));
  } catch {
    /* ignore */
  }
  update(id, (b) => ({
    ...b,
    xp: b.xp + (n < 3 ? 1 : 0),
    chat: memoryOn() ? turns.slice(-20) : [],
    stories: story ? [...b.stories, story].slice(-8) : b.stories,
  }));
}

/** 熟人在多人讨论里帮了忙：交情 +1（和单独聊天共用每天的上限，不存聊天记录） */
export function touchBond(id: string) {
  const today = new Date().toISOString().slice(0, 10);
  const dayKey = `need-quest-bond-day-${id}`;
  let n = 0;
  try {
    const v = JSON.parse(localStorage.getItem(dayKey) ?? 'null') as { d: string; n: number } | null;
    n = v?.d === today ? v.n : 0;
    localStorage.setItem(dayKey, JSON.stringify({ d: today, n: n + 1 }));
  } catch {
    /* ignore */
  }
  if (n < 3) update(id, (b) => ({ ...b, xp: b.xp + 1 }));
}
