import { money } from '../i18n';
import { optionsOf, type Answer, type Replies } from './engine';
import type { Beat, Lesson } from './schema';

/**
 * 一局里用户做过的每个选择，按「问题」排开（key 在同一关里固定）。
 * 分享给朋友时用它压缩上下文：同行的人玩同一关后逐条对比，参谋的人逐条点评。
 */
export type Pick = { key: string; q: string; label: string; emoji?: string; own?: boolean };

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
      out.push({ key: r.id, q: r.q, label: r.kind === 'budget' ? money(a.value) : `${a.value}${r.unit}`, emoji: r.emoji });
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
