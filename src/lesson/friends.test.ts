import { describe, expect, it } from 'vitest';
import xian from '../lessons/xian.json';
import xianZh from '../lessons/xian-zh.json';
import type { Answer } from './engine';
import { advisorLesson, companionLesson } from './friends';
import { comparePicks, picksOf } from './picks';
import { parseLesson, type Lesson } from './schema';

const load = (x: unknown) => {
  const r = parseLesson(x);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.lesson;
};

const answers: Answer[] = [
  { round: 'days', option: 'd3' },
  { round: 'when', option: 'm_spring' },
  { round: 'bus', talk: { how: { option: 'h_metro' } } },
  { round: 'day2', chain: { picks: { c_wall: 'right', c_museum: 'right', c_goose: 'left', c_night: 'right' } } },
  { round: 'heights', option: 'ht_no' },
];

describe('sharing a trip with real friends', () => {
  for (const [name, raw] of [['en', xian], ['zh', xianZh]] as const) {
    const base: Lesson = load(raw);
    const picks = picksOf(base, answers);

    it(`${name}: picks are keyed by question and carry the chosen label`, () => {
      expect(picks.find((p) => p.key === 'days')?.label).toBe(base.rounds.find((r) => r.id === 'days')!.type === 'pick' ? (base.rounds.find((r) => r.id === 'days') as any).options[1].label : '');
      expect(picks.some((p) => p.key === 'bus.how')).toBe(true);
      expect(picks.filter((p) => p.key.startsWith('day2.'))).toHaveLength(4);
    });

    it(`${name}: a companion plays the same level with the sharer's choices up front`, () => {
      const l = companionLesson(base, 'Alex', picks);
      expect(parseLesson(l).ok).toBe(true);
      const first = l.rounds.find((r) => r.type === 'talk')!;
      expect(first.type === 'talk' && first.beats.some((b) => 'say' in b && b.say.includes('Alex'))).toBe(true);
    });

    it(`${name}: an advisor gets a review level built from the choices`, () => {
      const l = advisorLesson(base, 'Alex', picks)!;
      expect(l).not.toBeNull();
      const chain = l.rounds.find((r) => r.type === 'chain');
      expect(chain && chain.type === 'chain' && chain.cards.length).toBe(Math.min(8, picks.filter((p) => !p.own).length));
    });
  }

  it('comparing two companions finds what they disagree on', () => {
    const base = load(xian);
    const mine = picksOf(base, answers);
    const theirs = picksOf(base, [{ round: 'days', option: 'd4' }, { round: 'when', option: 'm_spring' }]);
    const c = comparePicks(mine, theirs);
    expect(c.same.map((p) => p.key)).toEqual(['when']);
    expect(c.diff.map((d) => d.mine.key)).toEqual(['days']);
  });

  it('too few choices: no advisor level', () => {
    expect(advisorLesson(load(xian), 'Alex', [])).toBeNull();
  });
});
