import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLES } from './lessons';
import { play, type Answer } from './lesson/engine';
import { parseLesson, type Lesson } from './lesson/schema';
import { forget, lastQuest, memories, memoryText, remember, setMemoryOn } from './memory';

const car = (() => {
  const r = parseLesson(SAMPLES.find((s) => (s as { title: string }).title === '第一辆车'));
  if (!r.ok) throw new Error();
  return r.lesson;
})();

describe('memory', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
  });

  it('remembers a finished quest once, recalls it for other needs, and forgets on request', () => {
    const answers: Answer[] = [{ round: 'quarrel', talk: { use: { text: '每天上班，单程三十公里' } } }];
    const p = play(car, answers);
    remember(car, p);
    remember(car, p);
    expect(memories()).toHaveLength(1);
    expect(memoryText('怎么加油最省钱')).toContain('第一辆车');
    expect(memoryText('怎么加油最省钱')).toContain('每天上班，单程三十公里');
    expect(memoryText(car.need)).toBe('');
    expect(lastQuest('别的关')?.title).toBe('第一辆车');
    expect(lastQuest('第一辆车')).toBeNull();
    forget(memories()[0].key);
    expect(memories()).toHaveLength(0);
  });

  it('stores nothing when the user turned memory off, and does not keep the generic fallback', () => {
    setMemoryOn(false);
    remember(car, play(car, []));
    expect(memories()).toHaveLength(0);
    setMemoryOn(true);
    remember({ ...car, domain: 'generic' } as Lesson, play(car, []));
    expect(memories()).toHaveLength(0);
  });
});
