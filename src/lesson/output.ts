import type { Lang } from '../chars/library';
import { money } from '../i18n';
import type { Crash, Played } from './engine';
import type { Lesson } from './schema';

/** 金额按关卡的币种和语言格式化 */
export const yuan = (n: number) => money(n);

const H: Record<Lang, Record<string, string>> = {
  zh: {
    intro: '以下是用户通过「需求闯关」逐项确认过的真实需求（这是需求，不是方案）。请你基于它出具体方案。', plan: '目前的初步清单（估算）', haveMat: '用户手头已有的资料', needMat: '还需要用户补充的资料（出方案前请先向用户要）', 
    goalNote: '这个需求不以花钱为主：下面所有「价格 / 合计 / 上限」都是用户的「{name}」，单位：{unit}。请按这个资源来规划，不要换算成钱。',
    need: '用户原话', quotes: '用户自己说的话（原话，最能代表真实意图）', ask: '问', facts: '用户亲自确认的情况',
    est: '估算', adjust: '调整', total: '合计', guess: 'AI 盲猜起点', cap: '用户预算上限', noCap: '用户没有给出预算上限',
    risks: '用户明确接受的风险', crashes: '已验证不可行的省钱做法（用户试过，在其条件下会出问题）', verify: '待核实（沿用 AI 盲猜，用户未确认）',
    todo: '请你', t1: '先就「待核实」各项和「还需要补充的资料」向用户确认；', t2: '在预算内给出可执行的详细方案：采购清单（含规格型号）、实施步骤、验收标准；', t3: '以上数字均为估算，请给出核价渠道和方法，不要把估算当报价。',
    lang: '请用中文回答。',
  },
  en: {
    intro: 'Below is the user\'s real need, confirmed item by item in the game "Need Quest" (a need, not a plan). Please build the actual plan from it.', plan: 'Draft list so far (estimates)', haveMat: 'Materials the user already has', needMat: 'Materials still needed from the user (ask for them first)', 
    goalNote: 'This need is not mainly about money: every price / total / cap below is the user\'s "{name}", in {unit}. Plan around that resource; do not convert it to money.',
    need: "User's original request", quotes: "In the user's own words (best signal of real intent)", ask: 'Asked', facts: 'Confirmed by the user',
    est: 'estimate', adjust: 'Adjustment', total: 'Total', guess: 'AI initial guess', cap: 'User budget cap', noCap: 'User did not set a budget cap',
    risks: 'Risks the user explicitly accepted', crashes: 'Cost-cutting ideas proven not to work (the user tried; they fail under their conditions)', verify: 'To verify (kept from the AI guess, not confirmed)',
    todo: 'Please', t1: 'First confirm each "to verify" item and ask the user for the missing materials;', t2: 'Within budget, give an actionable detailed plan: bill of materials (with specs/models), steps, acceptance criteria;', t3: 'All prices are estimates — explain how to get real quotes; do not present estimates as quotes.',
    lang: 'Answer in English.',
  },
  ja: {
    intro: '以下は「ニーズクエスト」でユーザーが一つずつ確認した本当のニーズです（プランではありません）。これをもとに具体的なプランを作ってください。', haveMat: 'ユーザーの手元にある資料', needMat: 'まだユーザーに用意してもらう資料（先に依頼）', 
    goalNote: 'お金が主ではない要望です：以下の価格・合計・上限はすべてユーザーの「{name}」（単位：{unit}）。お金に換算せず、この資源で計画してください。',
    need: 'ユーザーの元の要望', quotes: 'ユーザー自身の言葉（本当の意図に最も近い）', ask: '質問', facts: 'ユーザーが確認した事実', plan: '現在のプラン',
    est: '概算', adjust: '調整', total: '合計', guess: 'AI の初期予想', cap: 'ユーザーの予算上限', noCap: '予算上限は未設定',
    risks: 'ユーザーが明示的に受け入れたリスク', crashes: '効かないと確認された節約案（ユーザーの条件では失敗する）', verify: '要確認（AI の予想のまま、未確認）',
    todo: 'お願い', t1: 'まず「要確認」の各項目をユーザーに確認してください；', t2: '予算内で実行可能な詳細プラン（型番付きの購入リスト、手順、検収基準）を作成；', t3: '価格はすべて概算です。見積もりの取り方を示し、概算を見積もりとして扱わないこと。',
    lang: '日本語で回答してください。',
  },
  es: {
    intro: 'Esta es la necesidad real del usuario, confirmada punto por punto en el juego «Need Quest» (una necesidad, no un plan). Construye el plan a partir de ella.', haveMat: 'Materiales que el usuario ya tiene', needMat: 'Materiales que aún faltan (pídelos primero)', 
    goalNote: 'Esta necesidad no es principalmente de dinero: cada precio / total / límite de abajo es el «{name}» del usuario, en {unit}. Planifica con ese recurso; no lo conviertas a dinero.',
    need: 'Petición original del usuario', quotes: 'En palabras del usuario (la mejor señal de su intención real)', ask: 'Pregunta', facts: 'Confirmado por el usuario', plan: 'Plan actual',
    est: 'estimado', adjust: 'Ajuste', total: 'Total', guess: 'Estimación inicial de la IA', cap: 'Presupuesto máximo', noCap: 'El usuario no fijó presupuesto',
    risks: 'Riesgos aceptados explícitamente', crashes: 'Ideas de ahorro que no funcionan (el usuario las probó; fallan en sus condiciones)', verify: 'Por verificar (de la estimación de la IA, sin confirmar)',
    todo: 'Por favor', t1: 'Primero confirma con el usuario cada punto «por verificar»;', t2: 'Dentro del presupuesto, da un plan detallado y ejecutable: lista de compras (con especificaciones), pasos, criterios de aceptación;', t3: 'Todos los precios son estimados: explica cómo obtener presupuestos reales; no los presentes como cotizaciones.',
    lang: 'Responde en español.',
  },
};

/** 通关后交给下游 AI 的上下文：原话、事实、方案、风险、待核实项分开写。 */
export function superPrompt(lesson: Lesson, p: Played, crashes: Crash[]): string {
  const h = H[lesson.lang];
  const guessTotal = lesson.guess.items.reduce((s, i) => s + i.price, 0);
  const untouched = lesson.guess.items.filter((i) => p.untouched.includes(i.id));
  const L: string[] = [];

  L.push(`# ${lesson.title}${lesson.domain ? ` (${lesson.domain})` : ''}`, '', h.intro, '');
  L.push(`## ${h.need}`, `> ${lesson.need}`, '');

  if (p.quotes.length) {
    L.push(`## ${h.quotes}`);
    p.quotes.forEach((q) => L.push(`- ${h.ask}「${q.q}」→「${q.text}」`));
    L.push('');
  }

  L.push(`## ${h.facts}`);
  p.facts.forEach((f) => L.push(`- ${f}`));
  L.push('');

  const have = p.materials.filter((m) => m.state === 'have');
  const need = p.materials.filter((m) => m.state !== 'have');
  if (have.length) L.push(`## ${h.haveMat}`, ...have.map((m) => `- ${m.label}: ${m.fact}`), '');
  if (need.length) L.push(`## ${h.needMat}`, ...need.map((m) => `- ${m.label}${m.state === 'unsure' ? ' (?)' : ''}: ${m.fact}`), '');

  L.push(`## ${h.plan}`);
  if (lesson.goal) L.push(`> ${h.goalNote.replace('{name}', lesson.goal.name).replace('{unit}', lesson.goal.unit)}`);
  for (const i of p.cart) L.push(`- ${i.name}: ${yuan(i.price)} (${i.source ?? h.est})${i.spec ? ` — ${i.spec}` : ''}`);
  for (const e of p.extras) L.push(`- ${h.adjust}「${e.label}」: ${e.price > 0 ? '+' : ''}${yuan(e.price)}`);
  L.push(`- ${h.total}: ${yuan(p.total)} (${h.guess} ${yuan(guessTotal)})`);
  L.push(p.budget !== null ? `- ${h.cap}: ${yuan(p.budget)}` : `- ${h.noCap}`);
  L.push('');

  if (p.risks.length) {
    L.push(`## ${h.risks}`);
    p.risks.forEach((r) => L.push(`- ${r}`));
    L.push('');
  }
  if (crashes.length) {
    L.push(`## ${h.crashes}`);
    crashes.forEach((c) => L.push(`- ${c.msg}`));
    L.push('');
  }
  if (untouched.length) {
    L.push(`## ${h.verify}`);
    untouched.forEach((i) => L.push(`- ${i.name}${i.spec ? `: ${i.spec}` : ''}`));
    L.push('');
  }

  L.push(`## ${h.todo}`, `1. ${h.t1}`, `2. ${h.t2}`, `3. ${h.t3}`, '', h.lang);
  return L.join('\n');
}
