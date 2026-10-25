import { describe, expect, it } from 'vitest';
import xian from './cities/xian.json';
import { City } from './schema';

describe('city data', () => {
  it('Xi\'an data is valid and every entry cites a source', () => {
    const r = City.safeParse(xian);
    expect(r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)).toEqual([]);
  });

  it('every pitfall is used by a sight or affects someone', () => {
    const c = City.parse(xian);
    const used = new Set(c.sights.flatMap((s) => s.pitfalls));
    expect(c.pitfalls.filter((p) => !used.has(p.id) && !p.affects.length).map((p) => p.id)).toEqual([]);
  });
});
