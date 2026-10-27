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

describe('splitsOf', () => {
  it('ranks route-changing choices first and lists rounds only one of them played', async () => {
    const { splitsOf } = await import('./picks');
    const { parseLesson } = await import('./schema');
    const xian = (await import('../lessons/xian.json')).default;
    const l = parseLesson(xian);
    if (!l.ok) throw new Error(l.errors.join('\n'));
    const P = (key: string, label: string, q = key) => ({ key, q, label });
    const me = [P('arrive.why', 'Noodles. So many noodles'), P('days', '3 days'), P('quarter.lane.diet', 'I eat everything'), P('heights', 'Love them')];
    const friend = [P('arrive.why', 'Mountains & views'), P('days', '3 days'), P('hua_base.cable.hua_route', 'Cable both ways'), P('heights', 'Absolutely not')];
    const sp = splitsOf(l.lesson, me, friend);
    expect(sp.big[0].key).toBe('arrive.why');
    expect(sp.big[0].weight).toBe(5);
    expect(sp.same.map((p) => p.key)).toEqual(['days']);
    expect(sp.route.mine).toEqual(['Muslim Quarter night']);
    expect(sp.route.theirs).toEqual(['Foot of Mount Hua']);
  });
});

describe('own route', () => {
  it('a goal in their own words gets its own scene in place of the written versions', async () => {
    const { branchOf, withOwnScene } = await import('./branch');
    const { play } = await import('./engine');
    const { parseLesson } = await import('./schema');
    const xian = (await import('../lessons/xian.json')).default;
    const l = parseLesson(xian);
    if (!l.ok) throw new Error(l.errors.join('\n'));
    const b = branchOf(l.lesson)!;
    expect(b.ownId).toBe('own_quarter');
    const placed = withOwnScene(l.lesson);
    expect(parseLesson(placed).ok).toBe(true);
    const scene = { ...b.base, title: 'Calligraphy street' };
    const done = withOwnScene(placed, scene);
    expect(done.rounds.filter((r) => r.id === 'own_quarter')).toHaveLength(1);
    // own words → own scene only; picking noodles → the Muslim Quarter only
    const { matches } = await import('./engine');
    const maps = (flags: Set<string>) => done.rounds.filter((r) => r.type === 'map' && matches(r.if, flags)).map((r) => r.id);
    const own = play(done, [{ round: 'arrive', talk: { why: { text: 'calligraphy shops' } } } as never]);
    const food = play(done, [{ round: 'arrive', talk: { why: { option: 'w_food' } } } as never]);
    const hike = play(done, [{ round: 'arrive', talk: { why: { option: 'w_mountain' } } } as never]);
    expect(maps(own.flags)).toEqual(['own_quarter']);
    expect(maps(food.flags)).toEqual(['quarter']);
    expect(maps(hike.flags)).toEqual(['hua_base']);
    expect(own.flags.has('own_goal')).toBe(true);
    expect(food.flags.has('own_goal')).toBe(false);
  });
});
