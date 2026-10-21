import { describe, expect, it } from 'vitest';
import farm from '../lessons/farm.json';
import { play } from './engine';
import { persona } from './persona';
import { parseLesson } from './schema';
import { setLocale } from '../i18n';

const l = (() => {
  const r = parseLesson(farm);
  if (!r.ok) throw new Error();
  return r.lesson;
})();

describe('need persona for sharing', () => {
  it('names a type, a twist and practical tips, without the user’s own words', () => {
    setLocale('zh', 'CNY');
    const answers = [{ round: 'why', talk: { why: { text: '我的私人秘密' } } }, { round: 'scale', option: 'small' }] as const;
    const p = play(l, [...answers]);
    const pz = persona(l, p, []);
    expect(['money', 'easy', 'good', 'safe']).toContain(pz.key);
    expect(pz.name.length).toBeGreaterThan(1);
    expect(pz.twist.length).toBeGreaterThan(3);
    expect(JSON.stringify(pz)).not.toContain('私人秘密');
  });

  it('leads with the sacrificed meter when the user accepted a crash', () => {
    const pz = persona(l, play(l, []), [], 'easy');
    expect(pz.twist).toContain('省心');
  });
});
