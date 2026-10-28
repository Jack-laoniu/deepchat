import { GUIDE } from '../chars/library';
import type { Pick } from './picks';
import { parseLesson, textWidth, type Lesson } from './schema';

/**
 * 分享给真实的朋友：两种身份，玩的都是分享的人那一关。
 * 每一步朋友先按自己的想法选，选完马上揭晓分享的人在这一步选了什么（见 screens/Reveal）——
 * 不一样就当场吐槽一句（原声或打字）。不在开头把 TA 的决定一股脑摆出来，免得朋友被带着选、也没了「原来你选这个」的那一下。
 * - 同行的人（companion）：说的是「我自己想怎么玩」，最后逐条对比哪里一致、哪里打架，发起人拍板。
 * - 参谋的人（advisor）：说的是「我觉得怎样才对」，每一步还能给 TA 的选择点「好选择 / 再想想」；
 *   通关后多一小段：TA 最容易低估什么、最担心哪一点、会不会一起去、一条建议，和结论。
 * 都不需要模型，按分享时的关卡现场拼出来。
 */
export type ShareRole = 'companion' | 'advisor';

/** 按显示宽度截断（中文 1，拉丁字母约 0.55） */
export function fit(s: string, max: number): string {
  if (textWidth(s) <= max) return s;
  let out = '';
  for (const c of s) {
    if (textWidth(`${out}${c}…`) > max) break;
    out += c;
  }
  return `${out}…`;
}

const T = {
  zh: {
    planning: '{name}正在计划：{title}',
    howTo: '每一步你先按自己的想法选，选完就能看到{name}选了什么。',
    tease: '不一样？尽管吐槽，TA 会听到。',
    yourTurn: '你是一起去的人：你自己想怎么玩？',
    check: 'TA 请你把把关。朋友的用处，就是敢说实话。',
    advTurn: '每一步按你觉得对的选，再给 TA 的选择点个好或再想想。',
    title: '最后几句',
    under: '{name}最容易低估什么？',
    underChips: ['时间', '钱', '走路的量', '睡眠'],
    underFact: '朋友说{name}最容易低估：{v}',
    worry: '整个计划你最担心哪一点？',
    worryChips: ['太赶了', '预算不够', '票还没订'],
    worryFact: '朋友最担心：{v}',
    join: '你会一起去吗？',
    joinYes: '想去！',
    joinMaybe: '看情况',
    joinNo: '这次不去',
    tip: '给 TA 一条建议？',
    tipFact: '朋友的建议：{v}',
    noted: '记下了，会原话转给 TA。',
    verdict: '你的结论？',
    vGo: '就这么办',
    vAdjust: '改一改再去',
    vRethink: '得重新想',
  },
  en: {
    planning: '{name} is planning: {title}',
    howTo: 'At each step, pick what YOU want, then see what {name} picked.',
    tease: "Different? Tease away. They'll hear it.",
    yourTurn: "You're coming along. What do YOU want?",
    check: "They asked you to check it. That's what friends are for: honesty.",
    advTurn: 'Pick what you think is right, then rate their pick: good call or rethink.',
    title: 'Last words',
    under: 'What does {name} always underestimate?',
    underChips: ['Time', 'Money', 'Walking', 'Sleep'],
    underFact: 'Friend says {name} underestimates: {v}',
    worry: 'What worries you most about the plan?',
    worryChips: ['Too rushed', 'Over budget', 'Nothing booked'],
    worryFact: "Friend's biggest worry: {v}",
    join: 'Would you join the trip?',
    joinYes: "I'm in!",
    joinMaybe: 'Maybe',
    joinNo: 'Not this time',
    tip: 'One tip for them?',
    tipFact: "Friend's tip: {v}",
    noted: "Noted. They'll get it word for word.",
    verdict: 'Your verdict?',
    vGo: 'Go as planned',
    vAdjust: 'Tweak it',
    vRethink: 'Rethink it',
  },
};

const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);
const langOf = (l: Lesson) => (l.lang === 'zh' ? 'zh' : 'en');

/** 开场几句并进第一段剧情（回合数有上限）；放不下就单独加一段 */
function withIntro(base: Lesson, lines: { who: string; say: string; mood?: 'happy' | 'smug' }[]): Lesson['rounds'] {
  const beats = lines.map((l) => ({ type: 'line' as const, ...l, say: fit(l.say, 40) }));
  const first = base.rounds.find((r) => r.type === 'talk');
  if (first && first.type === 'talk' && first.beats.length + beats.length <= 24) return base.rounds.map((r) => (r === first ? { ...first, beats: [...beats, ...first.beats] } : r));
  return [{ type: 'talk', id: 'share_intro', style: 'story', title: fit(base.title, 14), emoji: '💌', beats }, ...base.rounds];
}

/** 同行的人：同一关，开头说一下玩法（每一步揭晓 TA 的选择） */
export function companionLesson(base: Lesson, from: string): Lesson {
  const t = T[langOf(base)];
  const name = fit(from, 8);
  const rounds = withIntro(base, [
    { who: 'narrator', say: fill(t.planning, { name, title: base.title }) },
    { who: GUIDE, say: fill(t.howTo, { name }), mood: 'happy' },
    { who: GUIDE, say: t.tease, mood: 'smug' },
    { who: GUIDE, say: t.yourTurn },
  ]);
  const l = { ...base, curated: true, rounds };
  return parseLesson(l).ok ? l : base;
}

/**
 * 参谋要把关的那几个决定，旧版「把把关」卡片关里一张卡一个（按这个顺序）。
 * 只用来把旧分享里挂在 adv_review.card_N 上的原声对回分享的人的选择
 */
export function reviewPicks(picks: Pick[], voices: Record<string, unknown> = {}): Pick[] {
  return picks.filter((p) => !p.own || voices[p.key]).slice(0, 8);
}

/** 参谋的人：同一关（每一步揭晓 TA 的选择、点好 / 再想想），通关后多问几句、下个结论 */
export function advisorLesson(base: Lesson, from: string): Lesson {
  const t = T[langOf(base)];
  const name = fit(from, 8);
  const free = (chips: string[], fact: string) => ({ placeholder: '', chips, fact, match: [], reply: [{ who: GUIDE, say: t.noted }] });
  const more = {
    type: 'talk' as const,
    id: 'adv_more',
    style: 'story' as const,
    title: fit(t.title, 14),
    emoji: '💬',
    beats: [
      { id: 'adv_under', who: GUIDE, q: fit(fill(t.under, { name }), 24), options: [], free: free(t.underChips, fit(fill(t.underFact, { name }), 70)) },
      { id: 'adv_worry', who: GUIDE, q: fit(t.worry, 24), options: [], free: free(t.worryChips, t.worryFact) },
      {
        id: 'adv_join',
        who: GUIDE,
        q: fit(t.join, 24),
        options: [
          { id: 'join_yes', emoji: '🙋', label: t.joinYes, fact: t.joinYes },
          { id: 'join_maybe', emoji: '🤔', label: t.joinMaybe, fact: t.joinMaybe },
          { id: 'join_no', emoji: '🙅', label: t.joinNo, fact: t.joinNo },
        ],
      },
      { id: 'adv_tip', who: GUIDE, q: fit(t.tip, 24), options: [], free: free([], t.tipFact) },
    ],
  };
  const verdict = {
    type: 'boss' as const,
    id: 'adv_verdict',
    q: fit(t.verdict, 14),
    emoji: '⚖️',
    options: [
      { id: 'v_go', emoji: '✅', label: t.vGo, fact: t.vGo },
      { id: 'v_adjust', emoji: '🛠️', label: t.vAdjust, fact: t.vAdjust },
      { id: 'v_rethink', emoji: '🔄', label: t.vRethink, fact: t.vRethink },
    ],
  };
  const rounds = withIntro(base, [
    { who: 'narrator', say: fill(t.planning, { name, title: base.title }) },
    { who: GUIDE, say: t.check, mood: 'happy' },
    { who: GUIDE, say: t.advTurn, mood: 'smug' },
  ]);
  // 回合数有上限：放不下那一段追问就只留结论
  const tail = rounds.length + 2 <= 20 ? [more, verdict] : [verdict];
  const l = { ...base, curated: true, rounds: [...rounds, ...tail] };
  const r = parseLesson(l);
  if (!r.ok) console.error('advisor level invalid:', r.errors.slice(0, 3));
  return r.ok ? r.lesson : companionLesson(base, from);
}
