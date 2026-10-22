import { GUIDE } from '../chars/library';
import { Lesson, type Lesson as LessonT } from './schema';

/**
 * 兜底关卡：模型超时 / 一直写不对 / 接口挂了的时候用。不依赖模型，任何需求都能玩，
 * 问的是每个需求都绕不开的几件事：动机、给谁用、什么最重要、预算、作息、取舍、最常见的坑。
 * 物品清单留空位，交给下游 AI 按这些回答细化。domain 标成 generic，前端据此提示用户。
 */

const T = {
  zh: {
    title: '先把需求想清楚',
    guess: '还没细化，先告诉我你的情况',
    main: '主要花费', mainSpec: '交给 AI 按你的回答细化', buffer: '备用金',
    hi: '这次我先陪你把事情想清楚！', why: '你最想解决什么？',
    whyO: [['⏱️', '省时间', '最想省时间'], ['💰', '省钱', '最想省钱'], ['🛡️', '更安心', '最想要安心、少出错'], ['✨', '过得更好', '想让生活质量更好']],
    whyPh: '用你自己的话说说…', whyFact: '用户自己的说法：{v}',
    whoQ: '主要是谁用/受影响？',
    whoO: [['🙋', '我自己', '主要是自己用'], ['👨‍👩‍👧', '一家人', '全家都会用到/受影响'], ['🧓', '老人', '主要为老人'], ['🧒', '孩子', '主要为孩子']],
    sortQ: '哪些最重要？', must: '必须', nice: '最好有', skip: '不在乎',
    cards: [['💰', '价格', '价格'], ['⭐', '质量', '质量/效果'], ['🧰', '售后', '售后和维护'], ['⚡', '快', '尽快搞定'], ['👍', '口碑', '口碑和评价'], ['😌', '省心', '省心、少操心']],
    budgetQ: '最多花多少？', budgetFact: '预算上限：{v} 元',
    dayT: '你的一天', dayM: [
      ['morning', '☕', [['💪', '有精力', '早上有时间精力处理'], ['😫', '没空', '早上没空']]],
      ['evening', '🌇', [['🏠', '在家', '晚上一般在家'], ['🚗', '在外', '晚上常在外面']]],
      ['night', '🌙', [['📱', '手机办', '希望在手机上就能搞定'], ['🧑‍🔧', '找人办', '希望有人上门/代办']]],
    ],
    chainT: '真到做的时候', chain: [
      ['daliu', '贵一点的更省心，要不要加钱？', '💸', ['不加钱', '不愿为省心多花钱', { easy: -15 }], ['加钱', '愿意为省心多花钱', { easy: 15, good: 5 }]],
      ['mei', '等打折能便宜两成，但要等一个月', '🏷️', ['等打折', '愿意等一等换便宜', { good: -10, easy: -5 }], ['马上办', '不想等，马上办', { easy: 10 }]],
      ['xiaobei', '便宜的那家口碑一般，要赌一把吗？', '🎲', ['赌一把', '愿意为便宜冒点风险', { safe: -25 }], ['选靠谱', '宁可贵也选靠谱的', { safe: 15 }]],
    ],
    bossQ: '最怕的事来了', problem: '钱花了却不好用', fixL: '先试再买', fixF: '先试用/看样再决定', gamL: '直接买', gamCrash: '买回来发现不合适', gamOk: '运气不错，挺合适',
  },
  en: {
    title: 'Think it through',
    guess: 'Not detailed yet — tell me about you',
    main: 'Main cost', mainSpec: 'The AI details this from your answers', buffer: 'Buffer',
    hi: "Let's think this through together!", why: 'What do you want most?',
    whyO: [['⏱️', 'Save time', 'Mostly wants to save time'], ['💰', 'Save money', 'Mostly wants to save money'], ['🛡️', 'Peace of mind', 'Wants peace of mind and fewer mistakes'], ['✨', 'Better life', 'Wants a better quality of life']],
    whyPh: 'Say it your way…', whyFact: "In the user's words: {v}",
    whoQ: "Who's it mainly for?",
    whoO: [['🙋', 'Me', 'Mainly for themselves'], ['👨‍👩‍👧', 'Family', 'The whole family uses it'], ['🧓', 'Parents', 'Mainly for older parents'], ['🧒', 'Kids', 'Mainly for children']],
    sortQ: 'What matters?', must: 'Must', nice: 'Nice', skip: "Don't care",
    cards: [['💰', 'Price', 'Price'], ['⭐', 'Quality', 'Quality / results'], ['🧰', 'Support', 'After-sales support'], ['⚡', 'Fast', 'Done quickly'], ['👍', 'Reviews', 'Reputation and reviews'], ['😌', 'Easy', 'Low effort, no hassle']],
    budgetQ: 'Max budget?', budgetFact: 'Budget cap: {v}',
    dayT: 'Your day', dayM: [
      ['morning', '☕', [['💪', 'Free', 'Has time and energy in the morning'], ['😫', 'Busy', 'Busy in the mornings']]],
      ['evening', '🌇', [['🏠', 'Home', 'Usually home in the evening'], ['🚗', 'Out', 'Often out in the evening']]],
      ['night', '🌙', [['📱', 'Phone', 'Wants to handle it on the phone'], ['🧑‍🔧', 'Someone', 'Wants someone to come and do it']]],
    ],
    chainT: 'When it gets real', chain: [
      ['daliu', 'The pricier one is less hassle. Pay more?', '💸', ['Keep cheap', 'Will not pay extra for convenience', { easy: -15 }], ['Pay more', 'Will pay extra for convenience', { easy: 15, good: 5 }]],
      ['mei', 'Wait a month and it is 20% off.', '🏷️', ['Wait', 'Will wait to save money', { good: -10, easy: -5 }], ['Now', 'Wants it now', { easy: 10 }]],
      ['xiaobei', 'The cheap one has so-so reviews. Risk it?', '🎲', ['Risk it', 'Will take a risk to save money', { safe: -25 }], ['Go safe', 'Prefers the reliable option', { safe: 15 }]],
    ],
    bossQ: 'Your worst case', problem: 'Paid but useless', fixL: 'Try first', fixF: 'Tries or sees a sample before deciding', gamL: 'Just buy', gamCrash: "It doesn't fit after all", gamOk: 'Lucky — it fits',
  },
} as const;

export function genericLesson(need: string, lang: 'zh' | 'en'): LessonT {
  const d = T[lang];
  const opt = ([emoji, label, fact]: readonly [string, string, string], id: string, score?: Record<string, number>) => ({ id, emoji, label, fact, ...(score ? { score } : {}) });
  const raw = {
    v: 1,
    need: [...need].slice(0, 200).join(''),
    title: d.title,
    emoji: '🧭',
    domain: 'generic',
    lang,
    currency: lang === 'zh' ? 'CNY' : 'USD',
    cast: [{ id: 'daliu' }, { id: 'mei' }, { id: 'xiaobei' }],
    guess: {
      line: d.guess,
      items: [
        { id: 'main', emoji: '📦', name: d.main, price: 0, spec: d.mainSpec },
        { id: 'buffer', emoji: '🧯', name: d.buffer, price: 0 },
      ],
    },
    rounds: [
      {
        type: 'talk', id: 'why', style: 'chat', with: GUIDE, title: d.title, emoji: '💬',
        beats: [
          { who: GUIDE, say: d.hi, mood: 'happy' },
          { id: 'why', who: GUIDE, q: d.why, options: d.whyO.map((o, i) => opt(o, `why_${i}`)), free: { placeholder: d.whyPh, fact: d.whyFact } },
          { id: 'who', who: GUIDE, q: d.whoQ, options: d.whoO.map((o, i) => opt(o, `who_${i}`)), free: { placeholder: d.whyPh, fact: d.whyFact } },
        ],
      },
      {
        type: 'sort', id: 'matters', q: d.sortQ, emoji: '🗂️',
        bins: [{ id: 'must', label: d.must, emoji: '✅' }, { id: 'nice', label: d.nice, emoji: '🤔' }, { id: 'skip', label: d.skip, emoji: '❌', keep: false }],
        cards: d.cards.map(([emoji, label, fact], i) => ({ id: `c${i}`, emoji, label, fact })),
      },
      { type: 'slider', id: 'budget', q: d.budgetQ, emoji: '💰', kind: 'budget', min: 0, max: lang === 'zh' ? 50000 : 10000, step: lang === 'zh' ? 500 : 100, fact: d.budgetFact },
      {
        type: 'day', id: 'routine', title: d.dayT, emoji: '🗓️',
        moments: d.dayM.map(([at, emoji, os], i) => ({ id: `m${i}`, at, emoji, options: os.map((o, j) => opt(o, `m${i}_${j}`)) })),
      },
      {
        type: 'chain', id: 'real', title: d.chainT, emoji: '⚖️',
        cards: d.chain.map(([who, say, emoji, l, r], i) => ({
          id: `k${i}`, who, say, emoji,
          left: { id: `k${i}_l`, emoji: '👈', label: l[0], fact: l[1], score: l[2] },
          right: { id: `k${i}_r`, emoji: '👉', label: r[0], fact: r[1], score: r[2] },
        })),
      },
      {
        type: 'boss', id: 'boss', q: d.bossQ, emoji: '👹', problem: d.problem,
        options: [{ id: 'try', emoji: '🔍', label: d.fixL, fact: d.fixF, score: { safe: 15 } }],
        gamble: { emoji: '🎲', label: d.gamL, crash_if: [], crash: d.gamCrash, ok: d.gamOk },
      },
    ],
  };
  return Lesson.parse(raw);
}
