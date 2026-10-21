import type { Cond, Gamble, Item, Lesson, Option, Round } from './schema';

/**
 * 闯关规则：全部由 play(lesson, answers) 从答案列表重新推导，
 * 悔棋 = 去掉最后一个答案。
 */

export type Answer =
  | { round: string; option: string }
  | { round: string; value: number }
  | { round: string; gamble: true };

export interface Crash {
  round: string;
  msg: string;
  loss: number;
}

export interface Played {
  flags: Set<string>;
  cart: Item[];
  /** 不对应物品的价格调整 */
  extras: { label: string; price: number }[];
  total: number;
  budget: number | null;
  /** 当前要玩的回合；null 表示通关 */
  current: Round | null;
  done: number;
  /** 估算的总回合数（条件回合按当前标记估计） */
  estimate: number;
  facts: string[];
  /** 用户选择赌一把且没翻车的风险 */
  risks: string[];
  score: { easy: number; good: number; safe: number };
  /** 盲猜里没被任何选择碰过的物品 */
  untouched: string[];
}

export const matches = (c: Cond | undefined, flags: Set<string>) =>
  !c ||
  ((c.all ?? []).every((f) => flags.has(f)) &&
    ((c.any ?? []).length === 0 || (c.any ?? []).some((f) => flags.has(f))) &&
    !(c.none ?? []).some((f) => flags.has(f)));

export function optionsOf(r: Round): Option[] {
  if (r.type === 'pick' || r.type === 'fix' || r.type === 'boss') return r.options;
  if (r.type === 'swipe') return [r.yes, r.no];
  return [];
}

export function play(lesson: Lesson, answers: Answer[]): Played {
  const byRound = new Map(answers.map((a) => [a.round, a]));
  const flags = new Set<string>();
  const cart = new Map<string, Item>(lesson.guess.items.map((i) => [i.id, i]));
  const touched = new Set<string>();
  const extras: Played['extras'] = [];
  const facts: string[] = [];
  const risks: string[] = [];
  const score = { easy: 50, good: 50, safe: 50 };
  let budget: number | null = null;
  let current: Round | null = null;
  let done = 0;
  let estimate = 0;

  const applyOption = (o: Option) => {
    o.set.forEach((f) => flags.add(f));
    o.remove.forEach((id) => {
      cart.delete(id);
      touched.add(id);
    });
    o.add.forEach((it) => {
      cart.set(it.id, it);
      touched.add(it.id);
    });
    if (o.price) extras.push({ label: o.label, price: o.price });
    facts.push(o.fact);
    score.easy += o.score.easy ?? 0;
    score.good += o.score.good ?? 0;
    score.safe += o.score.safe ?? 0;
  };

  for (const r of lesson.rounds) {
    if (!matches(r.if, flags)) continue;
    if (current) {
      estimate++;
      continue;
    }
    const a = byRound.get(r.id);
    if (!a) {
      current = r;
      estimate++;
      continue;
    }
    done++;
    estimate++;
    if ('value' in a && r.type === 'slider') {
      if (r.kind === 'budget') budget = a.value;
      facts.push(r.fact.replace('{v}', String(a.value)));
    } else if ('gamble' in a && (r.type === 'fix' || r.type === 'boss')) {
      if (r.gamble.fact) facts.push(r.gamble.fact);
      risks.push(`${r.problem}：选择「${r.gamble.label}」。${r.gamble.ok}`);
      score.safe -= 15;
    } else if ('option' in a) {
      const o = optionsOf(r).find((x) => x.id === a.option);
      if (o) applyOption(o);
    }
  }

  const items = [...cart.values()];
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  return {
    flags,
    cart: items,
    extras,
    total: Math.max(0, items.reduce((s, i) => s + i.price, 0) + extras.reduce((s, e) => s + e.price, 0)),
    budget,
    current,
    done,
    estimate: Math.max(estimate, done + (current ? 1 : 0)),
    facts,
    risks,
    score: { easy: clamp(score.easy), good: clamp(score.good), safe: clamp(score.safe) },
    untouched: lesson.guess.items.filter((i) => !touched.has(i.id)).map((i) => i.id),
  };
}

export function gambleCrashes(g: Gamble, flags: Set<string>): boolean {
  if (g.crash_if === 'always') return true;
  return g.crash_if.some((f) => flags.has(f));
}

/** 选完之后，下一关是不是刚被这次选择「炸」出来的坑 */
export function revealsProblem(lesson: Lesson, before: Answer[], after: Answer[]): Round | null {
  const next = play(lesson, after).current;
  if (!next || next.type !== 'fix') return null;
  // 在旧的标记下这一关不会出现 → 是这次选择触发的
  const oldFlags = play(lesson, before).flags;
  return matches(next.if, oldFlags) ? null : next;
}

/** 选这个选项会让总价变化多少（新增 - 被替换 - 被移除 + 调整） */
export function optionDelta(cart: Item[], o: Option): number {
  const priceOf = (id: string) => cart.find((c) => c.id === id)?.price ?? 0;
  return o.price + o.add.reduce((s, i) => s + i.price - priceOf(i.id), 0) - o.remove.reduce((s, id) => s + priceOf(id), 0);
}
