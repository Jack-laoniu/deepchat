import { GUIDE } from '../chars/library';
import type { Pick } from './picks';
import { parseLesson, textWidth, type Lesson } from './schema';

/**
 * 分享给真实的朋友：两种身份，两种关卡。
 * - 同行的人（companion）：玩同一关，开场先看一眼分享的人已经定了什么，然后回答他自己的情况；最后逐条对比哪里一致、哪里打架。
 * - 参谋的人（advisor）：玩一关「把把关」：分享的人的每个决定一张卡，左滑再想想、右滑这个好；再说说 TA 最容易低估什么、最担心哪一点、一条建议、结论。
 * 都不需要模型，按分享时压缩好的选择（Pick）现场拼出来。
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
    decided: '{name}已经定了这些：',
    yourTurn: '你是一起去的人。现在轮到你：你自己想怎么玩？',
    check: 'TA 请你帮忙把把关。朋友的用处，就是敢说实话。',
    swipe: '接下来 TA 的每个决定，你说行不行。',
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
    title: '帮 TA 把把关',
    choices: 'TA 的决定',
    pickedQ: '{q}→{label}',
    picked: '{name}选了：{label}',
    rethink: '再想想',
    good: '这个好',
    rethinkFact: '朋友觉得要再想想：{q} → {label}',
    goodFact: '朋友认可：{q} → {label}',
    verdict: '你的结论？',
    vGo: '就这么办',
    vAdjust: '改一改再去',
    vRethink: '得重新想',
  },
  en: {
    planning: '{name} is planning: {title}',
    decided: '{name} already decided:',
    yourTurn: "You're coming along. Your turn: what do YOU want?",
    check: "They asked you to check it. That's what friends are for: honesty.",
    swipe: 'Now their choices. Good call, or rethink?',
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
    title: 'Check their plan',
    choices: 'Their choices',
    pickedQ: '{q} → {label}',
    picked: '{name} picked: {label}',
    rethink: 'Rethink',
    good: 'Good call',
    rethinkFact: 'Friend says rethink: {q} → {label}',
    goodFact: 'Friend agrees with: {q} → {label}',
    verdict: 'Your verdict?',
    vGo: 'Go as planned',
    vAdjust: 'Tweak it',
    vRethink: 'Rethink it',
  },
};

const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);
const langOf = (l: Lesson) => (l.lang === 'zh' ? 'zh' : 'en');

/** 同行的人：同一关，开头插一段「TA 已经定了这些」 */
export function companionLesson(base: Lesson, from: string, picks: Pick[]): Lesson {
  const t = T[langOf(base)];
  const name = fit(from, 8);
  const top = picks.filter((p) => !p.own).slice(0, 5);
  const intro: Lesson['rounds'][number] = {
    type: 'talk',
    id: 'share_intro',
    style: 'story',
    title: fit(t.decided.replace('{name}', name), 14),
    emoji: '💌',
    beats: [
      { type: 'line', who: 'narrator', say: fit(fill(t.planning, { name, title: base.title }), 40) },
      { type: 'line', who: GUIDE, say: fit(fill(t.decided, { name }), 40), mood: 'happy' },
      ...top.map((p) => ({ type: 'line' as const, who: GUIDE, say: fit(`${p.emoji ?? '📌'} ${p.label}`, 40) })),
      { type: 'line', who: GUIDE, say: fit(t.yourTurn, 40), mood: 'smug' },
    ],
  };
  // 关卡回合数有上限：能并进第一段剧情就并进去，否则单独加一段
  const first = base.rounds.find((r) => r.type === 'talk');
  const rounds =
    first && first.type === 'talk' && intro.type === 'talk' && first.beats.length + intro.beats.length <= 24
      ? base.rounds.map((r) => (r === first ? { ...first, beats: [...intro.beats, ...first.beats] } : r))
      : [intro, ...base.rounds];
  const l = { ...base, curated: true, rounds };
  return parseLesson(l).ok ? l : base;
}

/**
 * 参谋要把关的那几个决定（最多 8 个，「把把关」里一张卡一个，按这个顺序）：点选的都算；
 * 自己说的话只算留了原声的（voices 里有），参谋能听到 TA 的原话
 */
export function reviewPicks(picks: Pick[], voices: Record<string, unknown> = {}): Pick[] {
  return picks.filter((p) => !p.own || voices[p.key]).slice(0, 8);
}

/** 参谋的人：一关「帮 TA 把把关」 */
export function advisorLesson(base: Lesson, from: string, picks: Pick[], voices: Record<string, unknown> = {}): Lesson | null {
  const t = T[langOf(base)];
  const name = fit(from, 8);
  const speakers = [GUIDE, ...base.cast.map((c) => c.id)];
  const chosen = reviewPicks(picks, voices);
  if (chosen.length < 3) return null;
  const free = (chips: string[], fact: string) => ({
    placeholder: '',
    chips,
    fact,
    match: [],
    reply: [{ who: GUIDE, say: t.noted }],
  });
  const l = {
    v: 1,
    need: base.need,
    title: fit(t.title, 14),
    emoji: '🧐',
    domain: base.domain,
    lang: base.lang,
    currency: base.currency,
    cast: base.cast,
    curated: true,
    city: base.city,
    guess: base.guess,
    rounds: [
      {
        type: 'talk',
        id: 'adv_intro',
        style: 'story',
        title: fit(t.title, 14),
        emoji: '🧐',
        beats: [
          { who: 'narrator', say: fit(fill(t.planning, { name, title: base.title }), 40) },
          { who: GUIDE, say: fit(t.check, 40), mood: 'happy' },
          { id: 'adv_under', who: GUIDE, q: fit(fill(t.under, { name }), 24), options: [], free: free(t.underChips, fit(fill(t.underFact, { name }), 70)) },
          { who: GUIDE, say: fit(t.swipe, 40), mood: 'smug' },
        ],
      },
      {
        type: 'chain',
        id: 'adv_review',
        title: fit(t.choices, 14),
        emoji: '🗳️',
        cards: chosen.map((p, i) => {
          const full = fill(t.pickedQ, { q: p.q, label: p.label });
          const say = textWidth(full) <= 40 ? full : fit(fill(t.picked, { name, label: p.label }), 40);
          const qa = { q: p.q, label: p.label };
          return {
            id: `card_${i + 1}`,
            who: speakers[i % speakers.length],
            say,
            emoji: p.emoji ?? '📌',
            left: { id: `card_${i + 1}_no`, emoji: '🤔', label: t.rethink, fact: fit(fill(t.rethinkFact, qa), 120), score: { good: -5 } },
            right: { id: `card_${i + 1}_ok`, emoji: '👍', label: t.good, fact: fit(fill(t.goodFact, qa), 120), score: { good: 5 } },
          };
        }),
      },
      {
        type: 'talk',
        id: 'adv_more',
        style: 'story',
        title: fit(t.tip, 14),
        emoji: '💬',
        beats: [
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
      },
      {
        type: 'boss',
        id: 'adv_verdict',
        q: fit(t.verdict, 14),
        emoji: '⚖️',
        options: [
          { id: 'v_go', emoji: '✅', label: t.vGo, fact: t.vGo },
          { id: 'v_adjust', emoji: '🛠️', label: t.vAdjust, fact: t.vAdjust },
          { id: 'v_rethink', emoji: '🔄', label: t.vRethink, fact: t.vRethink },
        ],
      },
    ],
  };
  const r = parseLesson(l);
  if (!r.ok) console.error('advisor level invalid:', r.errors.slice(0, 3));
  return r.ok ? r.lesson : null;
}
