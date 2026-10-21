import { describe, expect, it } from 'vitest';
import { genericLesson } from './generic';
import { play } from './engine';

describe('generic fallback level', () => {
  it('is valid in both languages for any need, even a very long one', () => {
    for (const lang of ['zh', 'en'] as const) {
      const l = genericLesson('给孕妇选择月子中心还是请月嫂'.repeat(20), lang);
      expect(l.domain).toBe('generic');
      expect(l.rounds.some((r) => r.type === 'boss')).toBe(true);
      expect(play(l, []).current?.id).toBe('why');
    }
  });
});
