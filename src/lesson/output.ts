import type { Lesson } from './schema';
import type { Crash, Played } from './engine';

export const yuan = (n: number) => `¥${Math.round(n).toLocaleString('zh-CN')}`;

/** 通关后交给下游 AI 的上下文：事实、方案、风险、待核实项分开写。 */
export function superPrompt(lesson: Lesson, p: Played, crashes: Crash[]): string {
  const guessTotal = lesson.guess.items.reduce((s, i) => s + i.price, 0);
  const untouched = lesson.guess.items.filter((i) => p.untouched.includes(i.id));
  const L: string[] = [];

  L.push(`# ${lesson.title}${lesson.domain ? `（${lesson.domain}）` : ''}`, '');
  L.push('## 用户原话', `> ${lesson.need}`, '');

  if (p.quotes.length) {
    L.push('## 用户自己说的话（原话，最能代表真实意图）');
    p.quotes.forEach((q) => L.push(`- 问「${q.q}」→ 「${q.text}」`));
    L.push('');
  }

  L.push('## 用户亲自确认的情况');
  p.facts.forEach((f) => L.push(`- ${f}`));
  L.push('');

  L.push('## 当前方案');
  for (const i of p.cart) L.push(`- ${i.name}：${yuan(i.price)}${i.source ? `（${i.source}）` : '（估算）'}${i.spec ? ` — ${i.spec}` : ''}`);
  for (const e of p.extras) L.push(`- 调整「${e.label}」：${e.price > 0 ? '+' : ''}${yuan(e.price)}`);
  L.push(`- 合计：${yuan(p.total)}（AI 盲猜起点 ${yuan(guessTotal)}）`);
  L.push(p.budget !== null ? `- 用户预算上限：${yuan(p.budget)}` : '- 用户没有给出预算上限');
  L.push('');

  if (p.risks.length) {
    L.push('## 用户明确接受的风险');
    p.risks.forEach((r) => L.push(`- ${r}`));
    L.push('');
  }
  if (crashes.length) {
    L.push('## 已验证不可行的省钱做法（用户试过，在其条件下会出问题）');
    crashes.forEach((c) => L.push(`- ${c.msg}`));
    L.push('');
  }
  if (untouched.length) {
    L.push('## 待核实（沿用 AI 盲猜，用户未确认）');
    untouched.forEach((i) => L.push(`- ${i.name}${i.spec ? `：${i.spec}` : ''}`));
    L.push('');
  }

  L.push('## 请你');
  L.push('1. 先就「待核实」各项向用户确认；');
  L.push(`2. 在${p.budget !== null ? '预算上限' : '合理预算'}内给出可执行的详细方案：采购清单（含规格型号）、实施步骤、验收标准；`);
  L.push('3. 以上价格均为估算，请给出核价渠道和方法，不要把估算当报价。');
  return L.join('\n');
}
