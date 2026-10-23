import type { Played } from './lesson/engine';
import type { Lesson } from './lesson/schema';

/**
 * 角色的记忆：每通关一个需求，在这台设备上记一份小档案（不上传保存）。
 * 下次生成新关卡时交给 AI，让角色记得用户之前的情况（「你上回说想买插混，后来买了吗？」），
 * 已知的不再重复问；开场小芳也会提一句。用户可以在首页查看、逐条忘掉，或者整个关掉。
 */

export type QuestMemory = {
  /** 同一个需求再玩会覆盖旧的 */
  key: string;
  at: number;
  need: string;
  title: string;
  emoji: string;
  /** 做过的关键选择：「东西：选择」 */
  picks: string[];
  /** 需求清单里的东西 */
  plan: string[];
  /** 用户亲口说的话 */
  words: string[];
  /** 终章确认的资料 */
  materials: string[];
};

const KEY = 'need-quest-memory';
const OFF = 'need-quest-memory-off';
const MAX = 8;

const read = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* 隐私模式 / 存满了：记不住也不影响玩 */
  }
};

export const memoryOn = () => !read<boolean>(OFF, false);
export function setMemoryOn(on: boolean) {
  write(OFF, !on);
  if (!on) write(KEY, []);
}
export const memories = (): QuestMemory[] => (memoryOn() ? read<QuestMemory[]>(KEY, []) : []);
export const forget = (key: string) => write(KEY, read<QuestMemory[]>(KEY, []).filter((m) => m.key !== key));

const clip = (s: string, n: number) => ([...s].length > n ? [...s].slice(0, n).join('') + '…' : s);

/** 通关时记下这一局 */
export function remember(lesson: Lesson, p: Played) {
  if (!memoryOn() || lesson.domain === 'generic') return;
  const m: QuestMemory = {
    key: `${lesson.title}|${lesson.need}`,
    at: Date.now(),
    need: clip(lesson.need, 80),
    title: lesson.title,
    emoji: lesson.emoji,
    picks: p.decisions.slice(-14).map((d) => clip(`${d.thing}：${d.choice}`, 50)),
    plan: p.cart.map((i) => clip(i.name, 16)).slice(0, 10),
    words: p.quotes.map((q) => clip(q.text, 60)).slice(0, 5),
    materials: p.materials.map((x) => `${x.label}（${x.state === 'have' ? '有' : x.state === 'no' ? '没有' : '不确定'}）`),
  };
  write(KEY, [m, ...read<QuestMemory[]>(KEY, []).filter((x) => x.key !== m.key)].slice(0, MAX));
}

/** 交给生成器的记忆（纯文字，最多约 3000 字）；except = 当前这个需求本身不算「以前」 */
export function memoryText(except?: string): string {
  const list = memories().filter((m) => m.need !== except);
  if (!list.length) return '';
  const out: string[] = [];
  for (const m of list) {
    const days = Math.max(0, Math.round((Date.now() - m.at) / 86_400_000));
    const block = [
      `- ${days ? `${days} days ago` : 'earlier today'}: 「${m.need}」 (${m.title})`,
      m.picks.length ? `  choices: ${m.picks.join('; ')}` : '',
      m.plan.length ? `  plan items: ${m.plan.join(', ')}` : '',
      m.words.length ? `  in their words: ${m.words.map((w) => `「${w}」`).join(' ')}` : '',
      m.materials.length ? `  materials: ${m.materials.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    if (out.join('\n').length + block.length > 3000) break;
    out.push(block);
  }
  return out.join('\n');
}

/** 开场时小芳提的那一句用到的「上一次」 */
export function lastQuest(exceptTitle: string): QuestMemory | null {
  return memories().find((m) => m.title !== exceptTitle) ?? null;
}
