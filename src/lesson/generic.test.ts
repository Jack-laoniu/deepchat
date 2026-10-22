import { describe, expect, it } from 'vitest';
import { genericLesson } from './generic';
import { play } from './engine';
import { money, setLocale, t } from '../i18n';

describe('generic fallback level', () => {
  it('is valid in both languages for any need, even a very long one', () => {
    for (const lang of ['zh', 'en'] as const) {
      const l = genericLesson('给孕妇选择月子中心还是请月嫂'.repeat(20), lang);
      expect(l.domain).toBe('generic');
      expect(l.rounds.some((r) => r.type === 'boss')).toBe(true);
      expect(play(l, []).current?.id).toBe('why');
    }
  });

  it('uses time instead of money for needs that are not about spending', () => {
    const l = genericLesson('帮我制定一个早睡早起的计划', 'zh');
    expect(l.goal?.unit).toBe('分钟');
    expect(genericLesson('想买一台洗衣机', 'zh').goal).toBeUndefined();
    setLocale('zh', 'CNY', l.goal);
    expect(money(45)).toBe('45分钟');
    expect(t('hintBudget')).toContain('时间');
    setLocale('en', 'USD', { name: 'time', unit: 'min', emoji: '⏱️' });
    expect(money(30)).toBe('30 min');
    setLocale('zh', 'CNY');
    expect(money(45)).toContain('¥');
  });
});
