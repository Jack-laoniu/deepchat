import { describe, expect, it } from 'vitest';
import { SAMPLES } from '../lessons';
import { gambleCrashes, play, revealsProblem, type Answer } from './engine';
import { superPrompt } from './output';
import { parseLesson, type Lesson } from './schema';

const lessons = SAMPLES.map((s) => {
  const r = parseLesson(s);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.lesson;
});
const farm = lessons.find((l) => l.title.includes('农场'))!;
const pc = lessons.find((l) => l.title.includes('电脑'))!;

const pick = (round: string, option: string): Answer => ({ round, option });

describe('samples', () => {
  it('all samples are valid', () => expect(lessons).toHaveLength(3));

  it('rejects walls of text and dangling flags', () => {
    const bad = structuredClone(SAMPLES[0]) as any;
    bad.rounds[0].q = '这是一个特别特别特别长的、根本不适合放在游戏画面里的问题';
    bad.rounds[2].if = { all: ['nobody_sets_this'] };
    const r = parseLesson(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes('不超过 14'))).toBe(true);
      expect(r.errors.some((e) => e.includes('nobody_sets_this'))).toBe(true);
    }
  });

  it('accepts a fenced JSON string', () => {
    expect(parseLesson('```json\n' + JSON.stringify(SAMPLES[1]) + '\n```').ok).toBe(true);
  });
});

describe('play', () => {
  it('starts on the first round with the blind guess in the cart', () => {
    const p = play(farm, []);
    expect(p.current?.id).toBe('scale');
    expect(p.total).toBe(18000);
    expect(p.untouched).toHaveLength(5);
  });

  it('skips conditional rounds whose flags are not set', () => {
    const p = play(farm, [pick('scale', 'mid'), pick('land', 'flat')]);
    expect(p.current?.id).toBe('crop'); // fix_slope skipped
  });

  it('reveals a problem round triggered by the last choice', () => {
    const before = [pick('scale', 'mid')];
    const after = [...before, pick('land', 'slope')];
    expect(revealsProblem(farm, before, after)?.id).toBe('fix_slope');
    expect(revealsProblem(farm, before, [...before, pick('land', 'flat')])).toBeNull();
  });

  it('replaces items by id and removes items', () => {
    const p = play(farm, [pick('scale', 'mid'), pick('land', 'slope'), pick('fix_slope', 'pc_drip'), pick('crop', 'berry'), pick('water', 'tap')]);
    expect(p.cart.find((i) => i.id === 'head')?.name).toBe('补偿滴灌带');
    expect(p.cart.find((i) => i.id === 'pump')).toBeUndefined();
    // drip already installed → the rot problem never appears
    expect(p.current?.id).toBe('phone');
  });

  it('gamble crash depends on the user’s real conditions', () => {
    const boss = farm.rounds.find((r) => r.id === 'boss')!;
    if (boss.type !== 'boss') throw new Error();
    expect(gambleCrashes(boss.gamble, play(farm, [pick('scale', 'small')]).flags)).toBe(false);
    expect(gambleCrashes(boss.gamble, play(farm, [pick('scale', 'big')]).flags)).toBe(true);
  });

  it('any-conditions trigger from several sources', () => {
    const base = [pick('use', 'game'), pick('screen', 'r4k'), pick('place', 'floor')];
    expect(play(pc, base).current?.id).toBe('fix_psu');
  });

  it('records accepted risks, budget and facts; finishes', () => {
    const answers: Answer[] = [
      pick('scale', 'small'), pick('land', 'flat'), pick('crop', 'corn'), pick('water', 'river'),
      { round: 'fix_mud', gamble: true }, pick('phone', 'phone_no'), { round: 'budget', value: 5000 },
      { round: 'boss', gamble: true },
    ];
    const p = play(farm, answers);
    expect(p.current).toBeNull();
    expect(p.risks).toHaveLength(2);
    expect(p.budget).toBe(5000);
    expect(p.total).toBe(5000);
    const text = superPrompt(farm, p, [{ round: 'boss', msg: '主管接头被冲爆', loss: 8000 }]);
    expect(text).toContain('预算上限 5000 元');
    expect(text).toContain('用户明确接受的风险');
    expect(text).toContain('已验证不可行');
  });

  it('every sample can be finished by always taking the first option', () => {
    for (const l of lessons as Lesson[]) {
      const answers: Answer[] = [];
      for (let i = 0; i < 30; i++) {
        const c = play(l, answers).current;
        if (!c) break;
        if (c.type === 'slider') answers.push({ round: c.id, value: c.max });
        else if (c.type === 'swipe') answers.push(pick(c.id, c.yes.id));
        else answers.push(pick(c.id, c.options[0].id));
      }
      expect(play(l, answers).current).toBeNull();
    }
  });
});
