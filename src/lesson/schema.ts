import { z } from 'zod';

/**
 * 一个「关卡」= 一次需求闯关。由大模型生成，前端只负责演。
 *
 * 文字长度是硬约束：游戏画面里不允许出现大段文字，
 * 完整描述只放在 fact 里，进交付物，不上屏。
 */

const id = z.string().regex(/^[a-z0-9_]+$/, '只允许小写字母、数字和下划线');
const emoji = z.string().min(1).max(16);
const short = (n: number) => z.string().min(1).max(n, `不超过 ${n} 个字`);

export const Item = z.object({
  id,
  emoji,
  name: short(10),
  price: z.number().min(0),
  spec: z.string().max(80).default(''),
  /** 价格是否为估算（默认是）。只有给出来源的才算非估算 */
  source: z.string().max(80).optional(),
});
export type Item = z.infer<typeof Item>;

/** 回合出现条件：all 全部满足、any 满足其一、none 都不满足 */
export const Cond = z
  .object({
    all: z.array(id).default([]),
    any: z.array(id).default([]),
    none: z.array(id).default([]),
  })
  .partial();
export type Cond = z.infer<typeof Cond>;

const Score = z.object({ easy: z.number(), good: z.number(), safe: z.number() }).partial();

export const Option = z.object({
  id,
  emoji,
  label: short(8),
  /** 给下游 AI 的完整事实描述，不上屏 */
  fact: z.string().min(1).max(120),
  /** 选完后狐狸说的一句话 */
  tip: z.string().max(28).optional(),
  /** 放入方案的物品；与已有物品同 id 时替换 */
  add: z.array(Item).default([]),
  /** 从方案中移除的物品 id */
  remove: z.array(id).default([]),
  /** 不对应具体物品的价格调整（如规模变化） */
  price: z.number().default(0),
  set: z.array(id).default([]),
  score: Score.default({}),
});
export type Option = z.infer<typeof Option>;

export const Gamble = z.object({
  emoji: emoji.default('🎲'),
  label: short(8),
  fact: z.string().max(120).default(''),
  /** 'always' 必翻车；数组 = 命中其中任一标记时翻车；空数组 = 不会翻车，只是风险 */
  crash_if: z.union([z.literal('always'), z.array(id)]).default([]),
  crash: z.string().max(28).default(''),
  loss: z.number().min(0).default(0),
  ok: z.string().max(28).default(''),
});
export type Gamble = z.infer<typeof Gamble>;

const base = { id, q: short(14), emoji, if: Cond.optional() };

export const PickRound = z.object({ type: z.literal('pick'), ...base, options: z.array(Option).min(2).max(4) });
export const SwipeRound = z.object({ type: z.literal('swipe'), ...base, yes: Option, no: Option });
export const SliderRound = z.object({
  type: z.literal('slider'),
  ...base,
  /** budget：设定预算上限；number：普通数量 */
  kind: z.enum(['budget', 'number']).default('number'),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  value: z.number().optional(),
  unit: z.string().max(6).default(''),
  /** 事实模板，{v} 会被替换为数值 */
  fact: z.string().max(80),
});
export const FixRound = z.object({
  type: z.literal('fix'),
  ...base,
  /** 出问题的那个东西 */
  problem: short(12),
  options: z.array(Option).min(1).max(3),
  gamble: Gamble,
});
export const BossRound = z.object({
  type: z.literal('boss'),
  ...base,
  problem: short(12),
  options: z.array(Option).min(1).max(3),
  gamble: Gamble,
});

export const Round = z.discriminatedUnion('type', [PickRound, SwipeRound, SliderRound, FixRound, BossRound]);
export type Round = z.infer<typeof Round>;
export type PickRound = z.infer<typeof PickRound>;
export type SwipeRound = z.infer<typeof SwipeRound>;
export type SliderRound = z.infer<typeof SliderRound>;
export type FixRound = z.infer<typeof FixRound>;
export type BossRound = z.infer<typeof BossRound>;

export const Lesson = z
  .object({
    v: z.literal(1),
    need: z.string().min(1).max(200),
    title: short(14),
    emoji,
    domain: z.string().max(30).default(''),
    guess: z.object({
      line: short(28),
      items: z.array(Item).min(2).max(8),
    }),
    rounds: z.array(Round).min(3).max(16),
    secret: z.string().max(60).optional(),
  })
  .superRefine((l, ctx) => {
    const err = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
    const seen = new Set<string>();
    l.rounds.forEach((r, i) => {
      if (seen.has(r.id)) err(['rounds', i, 'id'], `回合 id 重复: ${r.id}`);
      seen.add(r.id);
      if (r.type === 'slider' && r.min >= r.max) err(['rounds', i], 'min 必须小于 max');
    });
    // 每个被条件引用的标记都应该能被某个选项设置出来，否则那一关永远不会出现
    const settable = new Set(
      l.rounds.flatMap((r) =>
        r.type === 'pick' ? r.options.flatMap((o) => o.set) :
        r.type === 'swipe' ? [...r.yes.set, ...r.no.set] :
        r.type === 'fix' || r.type === 'boss' ? r.options.flatMap((o) => o.set) : [],
      ),
    );
    l.rounds.forEach((r, i) => {
      const flags = [...(r.if?.all ?? []), ...(r.if?.any ?? [])];
      flags.forEach((f) => {
        if (!settable.has(f)) err(['rounds', i, 'if'], `标记 ${f} 没有任何选项会设置`);
      });
    });
    if (!l.rounds.some((r) => r.type === 'boss')) err(['rounds'], '至少需要一个 boss 回合');
  });
export type Lesson = z.infer<typeof Lesson>;

export type ParseResult = { ok: true; lesson: Lesson } | { ok: false; errors: string[] };

export function parseLesson(input: unknown): ParseResult {
  let data = input;
  if (typeof input === 'string') {
    const m = input.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    try {
      data = JSON.parse(m ? m[1] : input);
    } catch (e) {
      return { ok: false, errors: [`不是合法 JSON：${(e as Error).message}`] };
    }
  }
  const r = Lesson.safeParse(data);
  return r.success
    ? { ok: true, lesson: r.data }
    : { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.') || '根'}：${i.message}`) };
}
