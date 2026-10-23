import { describe, expect, it } from 'vitest';
import { genericLesson } from '../../lesson/generic';
import { parseLesson, type MapRound } from '../../lesson/schema';
import { SAMPLES } from '../../lessons';
import { canTalk, findPath, layoutMap } from './layout';

const maps = (): MapRound[] =>
  [...SAMPLES.map((s) => {
    const r = parseLesson(s);
    if (!r.ok) throw new Error(r.errors.join('\n'));
    return r.lesson;
  }), genericLesson('x', 'zh')].flatMap((l) => l.rounds.filter((r): r is MapRound => r.type === 'map'));

describe('adventure map layout', () => {
  it('places every spot and every NPC can be reached from the entrance', () => {
    const all = maps();
    expect(all.length).toBeGreaterThan(3);
    for (const m of all) {
      const L = layoutMap(m);
      expect(L.placed.length).toBe(m.spots.length);
      for (const p of L.placed) {
        const path = findPath(L.start, p.talk, L.blocked);
        expect(path, `${m.id}/${p.spot.id}`).not.toBeNull();
        expect(canTalk(p, p.talk)).toBe(true);
      }
    }
  });

  it('still fits five crowded spots in the same corner', () => {
    const base = maps()[0];
    const crowded = { ...base, spots: Array.from({ length: 5 }, (_, i) => ({ ...base.spots[0], id: `s${i}`, x: 10, y: 20 })) };
    const L = layoutMap(crowded);
    expect(L.placed.length).toBe(5);
    for (const p of L.placed) expect(findPath(L.start, p.talk, L.blocked)).not.toBeNull();
  });
});
