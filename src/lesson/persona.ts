import type { Crash, Played } from './engine';
import { money } from '../i18n';
import type { Lesson } from './schema';

/**
 * 分享用的「需求人格」：借鉴 Spotify Wrapped / 人格测试——
 * 人们愿意分享能代表「我是谁」的东西（身份）、带一点反差的发现（惊喜）、对朋友有用的提醒（实用）。
 * 只用玩法里的分数和选择，不带用户说过的原话，隐私需求也能放心晒。
 */

export type PersonaKey = 'money' | 'easy' | 'good' | 'safe';
export interface Persona {
  key: PersonaKey;
  emoji: string;
  name: string;
  motto: string;
  /** 海报主色（渐变两端） */
  colors: [string, string];
  /** 一句反差/发现 */
  twist: string;
  /** 给朋友的避坑提醒（来自这一关里遇到的问题） */
  tips: string[];
}

const NAMES: Record<'zh' | 'en', Record<PersonaKey, [string, string, string]>> = {
  zh: {
    money: ['💰', '精打细算派', '每一分钱都花在刀刃上'],
    easy: ['😌', '省心至上派', '能花钱解决的都不叫事'],
    good: ['🎯', '效果狂魔', '要做就做到最好'],
    safe: ['🛡️', '稳字当头派', '宁可慢一点，也不能出岔子'],
  },
  en: {
    money: ['💰', 'The Smart Saver', 'Every cent has a job'],
    easy: ['😌', 'The Easy-Goer', 'If money can fix it, it is not a problem'],
    good: ['🎯', 'The Perfectionist', 'Do it right or not at all'],
    safe: ['🛡️', 'The Safe Player', 'Slow is fine. Surprises are not'],
  },
};
const COLORS: Record<PersonaKey, [string, string]> = {
  money: ['#f59e0b', '#fde68a'],
  easy: ['#22c55e', '#bbf7d0'],
  good: ['#8b5cf6', '#ddd6fe'],
  safe: ['#0ea5e9', '#bae6fd'],
};
const METER: Record<'zh' | 'en', Record<string, string>> = {
  zh: { money: '钱', easy: '省心', good: '效果', safe: '安全' },
  en: { money: 'money', easy: 'ease', good: 'results', safe: 'safety' },
};

export function persona(lesson: Lesson, played: Played, crashes: Crash[], accepted?: string): Persona {
  const lang = lesson.lang === 'zh' ? 'zh' : 'en';
  const guess = lesson.guess.items.reduce((s, i) => s + i.price, 0);
  const saved = guess - played.total;
  const { easy, good, safe } = played.score;
  // 明显比 AI 第一眼的方案省钱 → 精打细算；否则看哪项分最高
  const key: PersonaKey = guess > 0 && saved > guess * 0.15 ? 'money' : (Object.entries({ easy, good, safe }).sort((a, b) => b[1] - a[1])[0][0] as PersonaKey);
  const [emoji, name, motto] = NAMES[lang][key];
  const zh = lang === 'zh';

  // 反差：优先「为了 A 一路牺牲 B」，其次「比 AI 猜的省/多花」，再其次「躲过/踩了几个坑」
  const fixes = lesson.rounds.filter((r) => r.type === 'fix' && played.visited.includes(r.id)).length;
  let twist: string;
  if (accepted) twist = zh ? `为了想要的，一路牺牲了「${METER.zh[accepted]}」` : `Happily traded away ${METER.en[accepted]} to get there`;
  else if (guess > 0 && Math.abs(saved) > guess * 0.1)
    twist = saved > 0 ? (zh ? `比 AI 第一眼的方案省了 ${money(saved)}` : `${money(saved)} cheaper than the AI's first guess`) : zh ? `比 AI 猜的多花 ${money(-saved)}，但每一分都有理由` : `${money(-saved)} over the AI's guess, and worth every cent`;
  else if (crashes.length) twist = zh ? `踩了 ${crashes.length} 个坑才学乖` : `Learned the hard way, ${crashes.length} time${crashes.length > 1 ? 's' : ''}`;
  else twist = zh ? `一路躲过了 ${fixes} 个坑` : `Dodged ${fixes} trap${fixes === 1 ? '' : 's'} on the way`;

  const tips = lesson.rounds
    .filter((r) => (r.type === 'fix' || r.type === 'boss') && played.visited.includes(r.id))
    .map((r) => (r.type === 'fix' || r.type === 'boss' ? r.problem : ''))
    .filter(Boolean)
    .slice(0, 2);

  return { key, emoji, name, motto, colors: COLORS[key], twist, tips };
}
