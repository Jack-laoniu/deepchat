import { describe, expect, it } from 'vitest';
import { SAMPLES } from '../lessons';
import dog from '../lessons/dog.json';
import { chainMeters, gambleCrashes, play, revealsProblem, walkBeats, type Answer, type Replies } from './engine';
import { superPrompt } from './output';
import { parseLesson, textWidth, type Beat, type Lesson } from './schema';
import { setLocale } from '../i18n';

const lessons = SAMPLES.map((s) => {
  const r = parseLesson(s);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.lesson;
});
const farm = lessons.find((l) => l.title.includes('农场'))!;
const pc = lessons.find((l) => l.title.includes('电脑'))!;

const pick = (round: string, option: string): Answer => ({ round, option });
const talk = (round: string, replies: Replies): Answer => ({ round, talk: replies });
/** 每个提问都选第一个选项；没有选项就说一句「不知道」 */
const firstReplies = (beats: Beat[]): Replies =>
  Object.fromEntries(beats.flatMap((b) => (b.type === 'ask' ? [[b.id, b.options[0] ? { option: b.options[0].id } : { text: '不知道' }]] : [])));

const why = talk('why', { why: { option: 'tired' } });
const story = (land: string, water: string) => talk('story', { land: { option: land }, water: { option: water } });

describe('samples', () => {
  it('all samples are valid', () => expect(lessons).toHaveLength(6));

  it('rejects walls of text, dangling flags and unknown speakers', () => {
    const bad = structuredClone(SAMPLES[0]) as any;
    bad.rounds[1].q = '这是一个特别特别特别长的、根本不适合放在游戏画面里的问题';
    bad.rounds[3].if = { all: ['nobody_sets_this'] };
    bad.rounds[2].beats[1].who = 'ghost';
    const r = parseLesson(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const all = r.errors.join('\n');
      expect(all).toContain('不超过 14');
      expect(all).toContain('nobody_sets_this');
      expect(all).toContain('ghost');
    }
  });

  it('accepts a fenced JSON string and beats without explicit type', () => {
    expect(parseLesson('```json\n' + JSON.stringify(SAMPLES[1]) + '\n```').ok).toBe(true);
    const story = farm.rounds.find((r) => r.id === 'story');
    expect(story?.type === 'talk' && story.beats.map((b) => b.type).includes('ask')).toBe(true);
  });
});

describe('dialogue', () => {
  it('free text is matched by keywords, sets flags and is kept verbatim', () => {
    const p = play(farm, [talk('why', { why: { text: '我常年在外地打工，家里没人' } })]);
    expect(p.flags.has('want_remote')).toBe(true);
    expect(p.quotes).toEqual([{ q: '先说说，为啥想装自动浇水？', text: '我常年在外地打工，家里没人' }]);
    expect(p.facts).toContain('用户自述想装的原因：我常年在外地打工，家里没人');
  });

  it('a story answer can trigger a problem round', () => {
    const before = [why, pick('scale', 'mid')];
    const after = [...before, story('slope', 'well')];
    expect(revealsProblem(farm, before, after)?.id).toBe('fix_slope');
    expect(play(farm, [...before, story('flat', 'well')]).current?.id).toBe('crop');
  });

  it('conditional lines react to earlier answers', () => {
    const town = farm.rounds.find((r) => r.id === 'town');
    if (town?.type !== 'map') throw new Error();
    const shop = town.spots[0].beats;
    const nag = (flags: string[], replies: Replies) =>
      walkBeats(shop, replies, new Set(flags)).visible.some((b) => b.type === 'line' && b.say.includes('手动可不行'));
    expect(nag(['want_remote'], { ctrl: { option: 'ctrl_manual' }, who_runs: { option: 'run_me' } })).toBe(true);
    expect(nag(['want_remote'], { ctrl: { option: 'ctrl_smart' }, who_runs: { option: 'run_me' } })).toBe(false);
    expect(nag([], { ctrl: { option: 'ctrl_manual' }, who_runs: { option: 'run_me' } })).toBe(false);
    // 已经有智能控制（比如分区轮灌）时，不再问要不要遥控
    expect(walkBeats(shop, {}, new Set(['smart'])).visible.some((b) => b.type === 'ask' && b.id === 'ctrl')).toBe(false);
  });

  it('walkBeats stops at the first unanswered question', () => {
    const s = farm.rounds.find((r) => r.id === 'story');
    if (s?.type !== 'talk') throw new Error();
    const v = walkBeats(s.beats, {}, new Set()).visible;
    expect(v[v.length - 1]).toMatchObject({ type: 'ask', id: 'land' });
  });
});

describe('play', () => {
  it('starts on the first round with the blind guess in the cart', () => {
    const p = play(farm, []);
    expect(p.current?.id).toBe('why');
    expect(p.total).toBe(18000);
    expect(p.untouched).toHaveLength(5);
  });

  it('replaces items by id and removes items', () => {
    const p = play(farm, [why, pick('scale', 'mid'), story('slope', 'tap'), pick('fix_slope', 'pc_drip'), pick('crop', 'berry')]);
    expect(p.cart.find((i) => i.id === 'head')?.name).toBe('补偿滴灌带');
    expect(p.cart.find((i) => i.id === 'pump')).toBeUndefined();
    // 已经装了滴灌 → 烂果问题不会出现，直接到整理归类
    expect(p.current?.id).toBe('extras');
  });

  it('gamble crash depends on the user’s real conditions', () => {
    const boss = farm.rounds.find((r) => r.id === 'boss')!;
    if (boss.type !== 'boss') throw new Error();
    expect(gambleCrashes(boss.gamble, play(farm, [why, pick('scale', 'small')]).flags)).toBe(false);
    expect(gambleCrashes(boss.gamble, play(farm, [why, pick('scale', 'big')]).flags)).toBe(true);
  });

  it('any-conditions trigger from several sources', () => {
    const use = pc.rounds[0];
    if (use.type !== 'talk') throw new Error();
    const answers: Answer[] = [talk(use.id, { use: { option: 'game' } }), pick('screen', 'r4k'), pick('place', 'floor')];
    expect(play(pc, answers).current?.id).toBe('fix_psu');
  });

  it('records risks, budget, facts and quotes; finishes', () => {
    const answers: Answer[] = [
      talk('why', { why: { text: '腰不好，浇不动了' } }),
      pick('scale', 'small'),
      story('flat', 'river'),
      { round: 'fix_mud', gamble: true },
      pick('crop', 'corn'),
      { round: 'extras', sort: { timer: 'must', app: 'skip', filter: 'must', sensor: 'nice' } },
      { round: 'season', chain: { picks: { c_dry: 'left', c_clog: 'left', c_night: 'right', c_cost: 'left' } } },
      {
        round: 'town',
        map: {
          shop: { ctrl: { option: 'ctrl_manual' }, who_runs: { option: 'run_elder' } },
          neighbor: { fear: { text: '怕冬天管子冻裂' } },
          home: { time: { option: 'tday' }, wish: { text: '多陪陪孩子' } },
        },
      },
      { round: 'budget', value: 5000 },
      { round: 'boss', gamble: true },
    ];
    const p = play(farm, answers);
    expect(p.current).toBeNull();
    expect(p.flags.has('frost')).toBe(true);
    expect(p.risks).toHaveLength(2);
    expect(p.quotes.map((q) => q.text)).toEqual(['腰不好，浇不动了', '怕冬天管子冻裂', '多陪陪孩子']);
    const text = superPrompt(farm, p, [{ round: 'boss', msg: '主管接头被冲爆', loss: 8000 }]);
    expect(text).toContain('用户自己说的话');
    expect(text).toContain('多陪陪孩子');
    expect(text).toContain('冬季有冰冻风险');
    expect(text).toContain('日常由家中老人管理');
    expect(text).toContain('预算上限 5000 元');
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
        else if (c.type === 'talk') answers.push(talk(c.id, firstReplies(c.beats)));
        else if (c.type === 'map') answers.push({ round: c.id, map: Object.fromEntries(c.spots.map((s) => [s.id, firstReplies(s.beats)])) });
        else if (c.type === 'chain') answers.push({ round: c.id, chain: { picks: Object.fromEntries(c.cards.map((x) => [x.id, 'left' as const])) } });
        else if (c.type === 'sort') answers.push({ round: c.id, sort: Object.fromEntries(c.cards.map((x) => [x.id, c.bins[0].id])) });
        else answers.push(pick(c.id, c.options[0].id));
      }
      expect(play(l, answers).current, l.title).toBeNull();
    }
  });
});

describe('characters & languages', () => {
  const dog = lessons.find((l) => l.title === 'Getting a dog')!;

  it('rejects characters that are not in the library', () => {
    const bad = structuredClone(SAMPLES[0]) as any;
    bad.cast.push({ id: 'unicorn' });
    expect(parseLesson(bad).ok).toBe(false);
  });

  it('measures length by display width so English is not squeezed', () => {
    expect(textWidth('地有多大？')).toBe(5);
    expect(textWidth('Where do you live?')).toBeCloseTo(18 * 0.55);
    const bad = structuredClone(SAMPLES[3]) as any;
    bad.rounds[1].q = 'Where exactly do you and your family currently live?';
    expect(parseLesson(bad).ok).toBe(false);
  });

  it('writes the hand-off in the level language and currency', () => {
    setLocale(dog.lang, dog.currency);
    const answers: Answer[] = [];
    for (let i = 0; i < 30; i++) {
      const c = play(dog, answers).current;
      if (!c) break;
      if (c.type === 'slider') answers.push({ round: c.id, value: 3000 });
      else if (c.type === 'talk') answers.push(talk(c.id, firstReplies(c.beats)));
      else if (c.type === 'map') answers.push({ round: c.id, map: Object.fromEntries(c.spots.map((s) => [s.id, firstReplies(s.beats)])) });
      else if (c.type === 'swipe') answers.push(pick(c.id, c.yes.id));
      else if (c.type === 'chain') answers.push({ round: c.id, chain: { picks: Object.fromEntries(c.cards.map((x) => [x.id, 'left' as const])) } });
      else if (c.type === 'sort') answers.push({ round: c.id, sort: Object.fromEntries(c.cards.map((x) => [x.id, c.bins[0].id])) });
      else answers.push(pick(c.id, c.options[0].id));
    }
    const text = superPrompt(dog, play(dog, answers), []);
    expect(text).toContain('## Confirmed by the user');
    expect(text).toContain('$3,000');
    expect(text).toContain('Answer in English.');
    setLocale('zh', 'CNY');
  });
});

describe('cheaper replacements', () => {
  it('rejects a downgrade that adds a new id without removing the original (it would raise the total)', () => {
    const l = structuredClone(dog) as any;
    const pick = l.rounds.find((r: any) => r.type === 'pick');
    pick.options[0].add = [{ id: 'used_dog', emoji: '🐕', name: 'Shelter dog', price: 150 }];
    pick.options[0].remove = [];
    const r = parseLesson(l);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.join('\n')).toMatch(/used_dog.*dog/);

    pick.options[0].add = [{ id: 'dog', emoji: '🐕', name: 'Shelter dog', price: 150 }]; // 同 id = 替换
    expect(parseLesson(l).ok).toBe(true);
  });
});

describe('sloppy JSON from models', () => {
  it('repairs unescaped quotes inside Chinese text and trailing commas', () => {
    const text = JSON.stringify(dog).replace('"Hey! I\'m Lele.', '"Hey! I\'m "Lele".').replace(/}$/, ',}');
    expect(() => JSON.parse(text)).toThrow();
    expect(parseLesson(text).ok).toBe(true);
  });
});

describe('sort and chain rounds', () => {
  const farmL = lessons.find((l) => l.title === '农场自动浇水')!;
  const before: Answer[] = [
    talk('why', { why: { text: '腰不好' } }),
    pick('scale', 'small'),
    story('flat', 'river'),
    { round: 'fix_mud', gamble: true },
    pick('crop', 'corn'),
  ];

  it('sorting puts kept items in the plan, drops the rest, and sets card_bin flags', () => {
    const p = play(farmL, [...before, { round: 'extras', sort: { timer: 'must', app: 'skip', filter: 'must', sensor: 'nice' } }]);
    expect(p.cart.map((i) => i.id)).toEqual(expect.arrayContaining(['timer', 'filter']));
    expect(p.cart.some((i) => i.id === 'app' || i.id === 'sensor')).toBe(false);
    expect(p.flags.has('app_skip')).toBe(true);
    expect(p.facts.some((f) => f.includes('远程控制') && f.includes('不要'))).toBe(true);
  });

  it('chain meters drop with each sacrifice and report the first one to run out', () => {
    const round = farmL.rounds.find((r) => r.type === 'chain')!;
    if (round.type !== 'chain') throw new Error();
    const start = { easy: 20, good: 50, safe: 50 };
    const cart = play(farmL, before).cart;
    expect(chainMeters(start, cart, round.cards, { c_dry: 'left' }).broke).toBeNull();
    // 一路「自己通」「明早再说」，省心先见底
    const r = chainMeters(start, cart, round.cards, { c_dry: 'right', c_clog: 'left', c_night: 'left' });
    expect(r.broke).toBe('easy');
    // 接受翻车 → 进交付物和风险
    const p = play(farmL, [...before, { round: 'extras', sort: {} }, { round: 'season', chain: { picks: { c_dry: 'right', c_clog: 'left' }, accepted: 'easy' } }]);
    expect(p.facts.some((f) => f.includes('省心'))).toBe(true);
    expect(p.risks.some((f) => f.includes('省心'))).toBe(true);
  });
});
