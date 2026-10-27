import { money } from '../i18n';
import { optionsOf, type Answer, type Replies } from './engine';
import { asksOf, type Beat, type Cond, type Lesson } from './schema';

/**
 * 一局里用户做过的每个选择，按「问题」排开（key 在同一关里固定）。
 * 分享给朋友时用它压缩上下文：同行的人玩同一关后逐条对比，参谋的人逐条点评。
 */
export type Pick = { key: string; q: string; label: string; emoji?: string; own?: boolean; value?: number };

const fromBeats = (beats: Beat[], replies: Replies, prefix: string): Pick[] =>
  beats.flatMap((b): Pick[] => {
    if (b.type !== 'ask' || !replies[b.id]) return [];
    const r = replies[b.id];
    if ('option' in r) {
      const o = b.options.find((x) => x.id === r.option);
      return o ? [{ key: `${prefix}${b.id}`, q: b.q, label: o.label, emoji: o.emoji }] : [];
    }
    const text = r.text.trim();
    return text ? [{ key: `${prefix}${b.id}`, q: b.q, label: text, own: true }] : [];
  });

export function picksOf(lesson: Lesson, answers: Answer[]): Pick[] {
  const out: Pick[] = [];
  for (const a of answers) {
    const r = lesson.rounds.find((x) => x.id === a.round);
    if (!r) continue;
    if ('option' in a) {
      const o = optionsOf(r).find((x) => x.id === a.option);
      if (o) out.push({ key: r.id, q: 'q' in r ? r.q : r.title, label: o.label, emoji: o.emoji });
    } else if ('value' in a && r.type === 'slider') {
      out.push({ key: r.id, q: r.q, label: r.kind === 'budget' ? money(a.value) : `${a.value}${r.unit}`, emoji: r.emoji, value: a.value });
    } else if ('gamble' in a && (r.type === 'fix' || r.type === 'boss') && r.gamble) {
      out.push({ key: r.id, q: r.q, label: r.gamble.label, emoji: r.gamble.emoji });
    } else if ('talk' in a && r.type === 'talk') {
      out.push(...fromBeats(r.beats, a.talk, `${r.id}.`));
    } else if ('map' in a && r.type === 'map') {
      for (const s of r.spots) if (a.map[s.id]) out.push(...fromBeats(s.beats, a.map[s.id], `${r.id}.${s.id}.`));
    } else if ('chain' in a && r.type === 'chain') {
      for (const c of r.cards) {
        const side = a.chain.picks[c.id];
        if (side) out.push({ key: `${r.id}.${c.id}`, q: c.say, label: c[side].label, emoji: c[side].emoji });
      }
    } else if ('finale' in a && r.type === 'boss') {
      const o = r.options.find((x) => x.id === a.finale.option);
      if (o) out.push({ key: r.id, q: r.q, label: o.label, emoji: o.emoji });
      else if (a.finale.own?.trim()) out.push({ key: r.id, q: r.q, label: a.finale.own.trim(), own: true });
      out.push(...fromBeats(r.probe, a.finale.replies, `${r.id}.`));
    }
  }
  return out;
}

/** 两个人在同一关里的选择：一样的、不一样的（同行的人对比用） */
export function comparePicks(mine: Pick[], theirs: Pick[]): { same: Pick[]; diff: { q: string; mine: Pick; theirs: Pick }[] } {
  const by = new Map(theirs.map((p) => [p.key, p]));
  const same: Pick[] = [];
  const diff: { q: string; mine: Pick; theirs: Pick }[] = [];
  for (const m of mine) {
    const o = by.get(m.key);
    if (!o) continue;
    if (o.label === m.label) same.push(m);
    else diff.push({ q: m.q, mine: m, theirs: o });
  }
  return { same, diff };
}

/**
 * 同行的两个人之间的分歧，按「有多大」排好：
 * - 改变了路线的选择（选项打的标记决定了后面出哪些回合，比如「最想干啥：吃 / 爬山」）、终局怎么玩 → 5
 * - 预算差三成以上 → 4；单选题 → 3；对话里的提问 → 2；滑卡 → 1
 * 自己打的字没法比，不算。big = 值得让发起人拍板的那几处（≥ 3）
 */
export type Split = { key: string; q: string; mine: Pick; theirs: Pick; weight: number };
export type Splits = { same: Pick[]; big: Split[]; small: Split[]; route: { mine: string[]; theirs: string[] } };

export function splitsOf(lesson: Lesson, mine: Pick[], theirs: Pick[]): Splits {
  const conds: Cond[] = lesson.rounds.flatMap((r) => (r.if ? [r.if] : []));
  const routeFlags = new Set(conds.flatMap((c) => [...(c.all ?? []), ...(c.any ?? []), ...(c.none ?? [])]));
  const roundOf = (key: string) => lesson.rounds.find((r) => r.id === key.split('.')[0]);
  const changesRoute = (key: string, label: string) => {
    const r = roundOf(key);
    if (!r) return false;
    const askId = key.split('.').pop();
    const opts = [...('options' in r && Array.isArray(r.options) ? r.options : []), ...asksOf(r).filter((a) => a.id === askId).flatMap((a) => a.options)];
    return opts.some((o) => o.label === label && o.set.some((f) => routeFlags.has(f)));
  };
  const weigh = (m: Pick, o: Pick) => {
    const r = roundOf(m.key);
    if (changesRoute(m.key, m.label) || changesRoute(o.key, o.label)) return 5;
    if (r?.type === 'boss') return 5;
    if (r?.type === 'slider' && m.value !== undefined && o.value !== undefined) return Math.abs(m.value - o.value) / Math.max(1, Math.max(m.value, o.value)) >= 0.3 ? 4 : 1;
    if (r?.type === 'pick') return 3;
    if (r?.type === 'chain' || r?.type === 'swipe') return 1;
    return 2;
  };
  const by = new Map(theirs.filter((p) => !p.own).map((p) => [p.key, p]));
  const same: Pick[] = [];
  const all: Split[] = [];
  mine.forEach((m) => {
    const o = by.get(m.key);
    if (!o || m.own) return;
    if (o.label === m.label) same.push(m);
    else all.push({ key: m.key, q: m.q, mine: m, theirs: o, weight: weigh(m, o) });
  });
  all.sort((a, b) => b.weight - a.weight);
  // 只有一个人走过的条件场景（地图、剧情；路线不一样）：列出场景标题
  const played = (ps: Pick[]) => new Set(ps.map((p) => p.key.split('.')[0]));
  const a = played(mine);
  const b = played(theirs);
  const title = (id: string) => {
    const r = lesson.rounds.find((x) => x.id === id);
    return r?.if && (r.type === 'map' || r.type === 'talk') ? r.title : null;
  };
  const only = (x: Set<string>, y: Set<string>) => [...x].filter((id) => !y.has(id)).flatMap((id) => title(id) ?? []);
  return { same, big: all.filter((s) => s.weight >= 3), small: all.filter((s) => s.weight < 3), route: { mine: only(a, b), theirs: only(b, a) } };
}
