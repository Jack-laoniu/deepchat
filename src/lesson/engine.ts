import type { Beat, ChainRound, Cond, FixRound, Free, Gamble, Item, Lesson, Option, Round, Line } from './schema';

/**
 * 闯关规则：全部由 play(lesson, answers) 从答案列表重新推导，
 * 悔棋 = 去掉最后一个答案。
 */

/** 对话里每个提问的回答：选了某个选项，或者用户自己说的话 */
/** react：用户自己打字时，角色针对原话的即时回应（在线生成；没有就用关卡里预设的台词） */
export type Replies = Record<string, { option: string } | { text: string; react?: { say: string; mood?: Line['mood'] } }>;

export type Answer =
  | { round: string; option: string }
  | { round: string; value: number }
  | { round: string; gamble: true }
  | { round: string; talk: Replies }
  | { round: string; map: Record<string, Replies> }
  /** 连环取舍：每张卡选了左还是右；accepted = 某条槽见底后用户选择「就这样」接受了（重来则不会提交） */
  | { round: string; chain: { picks: Record<string, 'left' | 'right'>; accepted?: Meter } }
  /** 整理归类：卡片 id → 筐 id */
  | { round: string; sort: Record<string, string> }
  /** 摆进生活：东西 id → 位置 id */
  | { round: string; place: Record<string, string> }
  /** 无文字的一天：时刻 id → 选项 id */
  | { round: string; day: Record<string, string> };

/** 连环取舍的四条槽 */
export const METERS = ['money', 'easy', 'good', 'safe'] as const;
export type Meter = (typeof METERS)[number];
const METER_NAME: Record<'zh' | 'en', Record<Meter, string>> = {
  zh: { money: '钱', easy: '省心', good: '效果', safe: '安全' },
  en: { money: 'money', easy: 'ease', good: 'results', safe: 'safety' },
};

/**
 * 连环取舍里四条槽现在的值（0~100）。三条沿用方案评分，钱按「这一步让总价涨了总价的百分之几」往下掉。
 * 返回第一条见底的槽。
 */
export function chainMeters(start: { easy: number; good: number; safe: number }, cart: Item[], cards: ChainRound['cards'], picks: Record<string, 'left' | 'right'>) {
  const m: Record<Meter, number> = { money: 60, ...start };
  let items = [...cart];
  let broke: Meter | null = null;
  for (const c of cards) {
    const side = picks[c.id];
    if (!side) break;
    const o = c[side];
    const total = Math.max(1, items.reduce((s, i) => s + i.price, 0));
    m.money -= (optionDelta(items, o) / total) * 100;
    m.easy += o.score.easy ?? 0;
    m.good += o.score.good ?? 0;
    m.safe += o.score.safe ?? 0;
    items = items.filter((i) => !o.remove.includes(i.id) && !o.add.some((a) => a.id === i.id)).concat(o.add);
    for (const k of METERS) m[k] = Math.max(0, Math.min(100, m[k]));
    broke ??= METERS.find((k) => m[k] <= 0) ?? null;
    if (broke) break;
  }
  return { meters: m, broke };
}

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
  /** 用户用自己的话说的内容（最有价值的输入） */
  quotes: { q: string; text: string }[];
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

/** 自由回答命中了哪些关键词规则（不区分大小写） */
export function matchFree(free: Free, text: string) {
  const t = text.toLowerCase();
  return free.match.filter((m) => m.words.some((w) => t.includes(w.toLowerCase())));
}

/**
 * 按顺序走一遍对话，返回可见的台词（受 if 条件控制）以及回答带来的标记。
 * UI 边播放边调用它，引擎结算时也用它，保证两边一致。
 */
export function walkBeats(beats: Beat[], replies: Replies, baseFlags: Set<string>) {
  const flags = new Set(baseFlags);
  const visible: Beat[] = [];
  for (const b of beats) {
    if (!matches(b.if, flags)) continue;
    visible.push(b);
    if (b.type !== 'ask') continue;
    const r = replies[b.id];
    if (!r) break; // 停在还没回答的提问上
    if ('option' in r) b.options.find((o) => o.id === r.option)?.set.forEach((f) => flags.add(f));
    else if (b.free) matchFree(b.free, r.text).forEach((m) => m.set.forEach((f) => flags.add(f)));
  }
  return { visible, flags };
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
  const quotes: Played['quotes'] = [];
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

  const applyBeats = (beats: Beat[], replies: Replies) => {
    for (const b of walkBeats(beats, replies, flags).visible) {
      if (b.type !== 'ask' || !replies[b.id]) continue;
      const r = replies[b.id];
      if ('option' in r) {
        const o = b.options.find((x) => x.id === r.option);
        if (o) applyOption(o);
      } else if (b.free) {
        const text = r.text.trim();
        facts.push(b.free.fact.replace('{v}', text));
        quotes.push({ q: b.q, text });
        for (const m of matchFree(b.free, text)) {
          m.set.forEach((f) => flags.add(f));
          if (m.fact) facts.push(m.fact);
        }
      }
    }
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
      risks.push(`${r.problem} → 「${r.gamble.label}」${r.gamble.ok ? `: ${r.gamble.ok}` : ""}`);
      score.safe -= 15;
    } else if ('option' in a) {
      const o = optionsOf(r).find((x) => x.id === a.option);
      if (o) applyOption(o);
    } else if ('talk' in a && r.type === 'talk') {
      applyBeats(r.beats, a.talk);
    } else if ('map' in a && r.type === 'map') {
      for (const spot of r.spots) if (a.map[spot.id]) applyBeats(spot.beats, a.map[spot.id]);
    } else if ('chain' in a && r.type === 'chain') {
      for (const c of r.cards) {
        const side = a.chain.picks[c.id];
        if (side) applyOption(c[side]);
      }
      if (a.chain.accepted) {
        const name = METER_NAME[lesson.lang === 'zh' ? 'zh' : 'en'][a.chain.accepted];
        facts.push(lesson.lang === 'zh' ? `连环取舍里用户一路牺牲「${name}」直到见底，并表示可以接受` : `In the trade-off run the user kept sacrificing ${name} until it ran out, and accepted that`);
        risks.push(lesson.lang === 'zh' ? `「${name}」被压到了底` : `${name} was pushed to zero`);
      }
    } else if ('place' in a && r.type === 'place') {
      for (const th of r.things) {
        const z = r.zones.find((x) => x.id === a.place[th.id]);
        if (!z) continue;
        flags.add(`${th.id}_${z.id}`);
        facts.push(`${th.fact} → ${z.label}${z.fact ? `（${z.fact}）` : ''}`);
        if (z.bad.includes(th.id) && z.warn) risks.push(`${th.label} → ${z.label}: ${z.warn}`);
      }
    } else if ('day' in a && r.type === 'day') {
      for (const m of r.moments) {
        const o = m.options.find((x) => x.id === a.day[m.id]);
        if (o) applyOption(o);
      }
    } else if ('sort' in a && r.type === 'sort') {
      for (const c of r.cards) {
        const bin = r.bins.find((b) => b.id === a.sort[c.id]);
        if (!bin) continue;
        flags.add(`${c.id}_${bin.id}`);
        facts.push(`${c.fact} → ${bin.label}`);
        if (c.item) {
          if (bin.keep) cart.set(c.item.id, c.item);
          else cart.delete(c.item.id);
          touched.add(c.item.id);
        }
      }
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
    quotes,
  };
}

export function gambleCrashes(g: Gamble, flags: Set<string>): boolean {
  if (g.crash_if === 'always') return true;
  return g.crash_if.some((f) => flags.has(f));
}

/** 选完之后，下一关是不是刚被这次选择「炸」出来的坑 */
export function revealsProblem(lesson: Lesson, before: Answer[], after: Answer[]): FixRound | null {
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
