import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLES } from './lessons';
import { play, type Answer } from './lesson/engine';
import { parseLesson, type Lesson } from './lesson/schema';
import { bondOf, earn, friends, gainsOf, heartsOf, saveChat, toNextHeart } from './bond';

const car = (() => {
  const r = parseLesson(SAMPLES.find((s) => (s as { title: string }).title === '第一辆车'));
  if (!r.ok) throw new Error();
  return r.lesson as Lesson;
})();

describe('bonds', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
  });

  it('hearts grow with closeness', () => {
    expect(heartsOf(0)).toBe(0);
    expect(heartsOf(2)).toBe(1);
    expect(heartsOf(5)).toBe(2);
    expect(heartsOf(99)).toBe(5);
    expect(toNextHeart(3)).toBe(2);
  });

  it('characters you met and answered in your own words get closer; an invited friend gets a bonus', () => {
    const answers: Answer[] = [{ round: 'quarrel', talk: { use: { text: '每天上班，单程三十公里' }, fear: { text: '怕修车贵' } } }];
    const p = play(car, answers);
    const g = gainsOf(car, p, 'mei');
    expect(g.ajie).toBe(2); // 出场 + 回答了他的问题
    expect(g.wang).toBe(2);
    expect(g.mei).toBe(2); // 没出场，但被请来帮忙
    expect(g.me).toBeUndefined();
    const r = earn(car, p, 'mei');
    expect(r.find((x) => x.id === 'ajie')).toMatchObject({ before: 0, after: 1 });
    expect(friends().map((f) => f.id)).toContain('wang');
    expect(bondOf('wang').quests).toEqual(['第一辆车']);
  });

  it('chatting adds a little closeness (capped per day) and remembers stories told', () => {
    for (let i = 0; i < 5; i++) saveChat('wang', [{ role: 'user', content: 'hi' }], i === 0 ? '第一次卖车被骗' : undefined);
    expect(bondOf('wang').xp).toBe(3);
    expect(bondOf('wang').stories).toEqual(['第一次卖车被骗']);
  });
});
