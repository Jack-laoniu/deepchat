import type { Played } from './engine';
import type { BossRound, Lesson, Round } from './schema';

/**
 * 交给模型重写终章用的「这一局到目前为止」：玩过哪些回合、做了什么选择、亲口说了什么、
 * 现在清单里有什么（哪些还只是 AI 盲猜）。纯文字，控制在几千字以内。
 */
export function journeyText(lesson: Lesson, p: Played): string {
  const byId = new Map(lesson.rounds.map((r) => [r.id, r]));
  const untouched = new Set(p.untouched);
  const L: string[] = [];
  L.push(`Rounds played: ${p.visited.map((id) => describe(byId.get(id))).filter(Boolean).join(' / ')}`);
  if (p.budget !== null) L.push(`Budget cap the user set: ${p.budget}`);
  L.push(`Current total: ${p.total}${lesson.goal ? ` ${lesson.goal.unit}` : ` ${lesson.currency}`}`);
  L.push('Plan items now (id · name · price):');
  for (const i of p.cart) L.push(`- ${i.id} · ${i.name}${i.spec ? ` (${i.spec})` : ''} · ${i.price}${untouched.has(i.id) ? ' · never touched (AI blind guess)' : ''}`);
  for (const x of p.extras) L.push(`- adjustment · ${x.label} · ${x.price}`);
  if (p.decisions.length) L.push('Decisions:', ...p.decisions.map((d) => `- ${d.thing}: ${d.choice}`));
  if (p.quotes.length) L.push('In their own words:', ...p.quotes.map((q) => `- asked 「${q.q}」 → 「${q.text}」`));
  if (p.facts.length) L.push('What we learned:', ...p.facts.slice(-24).map((f) => `- ${f}`));
  if (p.risks.length) L.push('Risks they accepted:', ...p.risks.map((r) => `- ${r}`));
  if (p.sacrificed) L.push(`In the trade-off game they accepted giving up: ${p.sacrificed}`);
  if (p.gifts.length) L.push(`Got from characters: ${p.gifts.map((g) => `${g.label} (${g.from})`).join(', ')}`);
  return L.join('\n').slice(0, 7000);
}

/** 回合的标题：剧情关叫 title，其他叫 q */
export const roundLabel = (r: Round) => ('q' in r ? r.q : r.title);
const describe = (r: Round | undefined) => (r ? `${r.type}「${roundLabel(r)}」` : '');

/** 这一关的终章（最后一个 boss 回合） */
export const bossOf = (lesson: Lesson): BossRound | undefined => [...lesson.rounds].reverse().find((r): r is BossRound => r.type === 'boss');

/** 换上新终章（沿用原来的 id 和位置） */
export function withBoss(lesson: Lesson, boss: BossRound): Lesson {
  const old = bossOf(lesson);
  if (!old) return lesson;
  return { ...lesson, rounds: lesson.rounds.map((r) => (r === old ? { ...boss, id: old.id, if: old.if } : r)) };
}
