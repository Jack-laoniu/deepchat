import { describe, expect, it } from 'vitest';
import farm from '../lessons/farm.json';
import { explainIssues, salvage } from './salvage';
import { parseLesson, textWidth } from './schema';

// 复现线上 gpt-5.4-mini 的典型错误
const broken = () => {
  const l = structuredClone(farm) as any;
  const why = l.rounds[0];
  const free = why.beats.find((b: any) => b.free)?.free;
  free.chips = ['腰不好', '太累', '省水', '没人手', '想偷懒']; // 5 个，上限 4
  const fixR = l.rounds.find((r: any) => r.type === 'fix');
  fixR.problem = '一到夏天下午地里就特别特别干旱，水根本不够用'; // 超过 12 宽
  return l;
};

describe('salvage', () => {
  it('fixes small mistakes without dropping content (light)', () => {
    const l = broken();
    expect(parseLesson(l).ok).toBe(false);
    const s = salvage(l)!;
    expect(s).not.toBeNull();
    expect(s.heavy).toBe(false);
    const fixR = s.lesson.rounds.find((r) => r.type === 'fix')!;
    if (fixR.type !== 'fix') throw new Error();
    expect(textWidth(fixR.problem)).toBeLessThanOrEqual(12);
    expect(fixR.problem.endsWith('…')).toBe(true);
  });

  it('drops a chain card that is missing a side (heavy) and keeps the rest', () => {
    const l = broken();
    const chain = l.rounds.find((r: any) => r.type === 'chain');
    delete chain.cards[2].right;
    const s = salvage(l)!;
    expect(s.heavy).toBe(true);
    const c = s.lesson.rounds.find((r) => r.type === 'chain')!;
    if (c.type !== 'chain') throw new Error();
    expect(c.cards).toHaveLength(3);
  });

  it('removes a whole round when it cannot be saved, but never the boss', () => {
    const l = broken();
    const chain = l.rounds.find((r: any) => r.type === 'chain');
    for (const c of chain.cards) delete c.left; // 全坏
    const s = salvage(l)!;
    expect(s.lesson.rounds.some((r) => r.type === 'chain')).toBe(false);
    expect(s.lesson.rounds.some((r) => r.type === 'boss')).toBe(true);
    const noBoss = structuredClone(farm) as any;
    noBoss.rounds = noBoss.rounds.filter((r: any) => r.type !== 'boss');
    expect(salvage(noBoss)).toBeNull();
  });

  it('adds a library character that the model forgot to cast', () => {
    const l = structuredClone(farm) as any;
    l.rounds[2].beats[1].who = 'xiaoting';
    const s = salvage(l)!;
    expect(s.heavy).toBe(false);
    expect(s.lesson.cast.some((c) => c.id === 'xiaoting')).toBe(true);
  });

  it('tells the model the offending text and its width', () => {
    const l = broken();
    const r = parseLesson(l);
    if (r.ok) throw new Error();
    const lines = explainIssues(r.data, r.issues!);
    expect(lines.some((x) => x.includes('一到夏天') && x.includes('limit is 12'))).toBe(true);
    expect(lines.some((x) => x.includes('5 items, at most 4'))).toBe(true);
  });
});

describe('follow-up levels never re-ask decided things', () => {
  it('removes already decided sort cards, and the round when too few remain', async () => {
    const { dropDecided } = await import('./salvage');
    const r = parseLesson(farm);
    if (!r.ok) throw new Error();
    // 上一关已经把「手机遥控」归为不要
    const a = dropDecided(r.lesson, ['手机遥控']);
    const sort = a.lesson.rounds.find((x) => x.type === 'sort')!;
    if (sort.type !== 'sort') throw new Error();
    expect(sort.cards.map((c) => c.label)).not.toContain('手机遥控');
    expect(a.dropped).toEqual(['手机遥控']);
    // 四张卡里三张已决定 → 剩一张，整关去掉
    const b = dropDecided(r.lesson, ['手机遥控', '定时控制器', '过滤器']);
    expect(b.lesson.rounds.some((x) => x.type === 'sort')).toBe(false);
  });
});

describe('decisions recorded for follow-ups', () => {
  it('lists sorted cards with the bin chosen', async () => {
    const { play } = await import('./engine');
    const r = parseLesson(farm);
    if (!r.ok) throw new Error();
    const p = play(r.lesson, [
      { round: 'why', talk: {} },
      { round: 'scale', option: 'small' },
      { round: 'story', talk: {} },
      { round: 'fix_mud', gamble: true },
      { round: 'crop', option: 'corn' },
      { round: 'extras', sort: { app: 'skip', timer: 'must', filter: 'must', sensor: 'nice' } },
    ]);
    expect(p.decisions).toContainEqual({ thing: '远程控制模块', choice: '不要' });
    expect(p.decisions).toContainEqual({ thing: '手机遥控', choice: '不要' });
  });
});
