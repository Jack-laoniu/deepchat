import { jsonrepair } from 'jsonrepair';
import { z } from 'zod';
import { CHARACTER_IDS, GUIDE, LANGS, LEGACY_IDS, MOODS } from '../chars/library';

/**
 * 一个「关卡」= 一次需求闯关。由大模型生成，前端只负责演。
 *
 * 文字长度是硬约束：游戏画面里不允许出现大段文字，
 * 完整描述只放在 fact 里，进交付物，不上屏。
 */

const id = z.string().regex(/^[a-z0-9_]+$/, '只允许小写字母、数字和下划线');
const emoji = z.string().min(1).max(16);
/** 显示宽度：中日韩字符算 1，其余（拉丁字母、数字、空格）算 0.55，这样各语言的字数上限差不多公平 */
export const textWidth = (s: string) => [...s].reduce((w, c) => w + (/[\u2E80-\uFFEF]/.test(c) ? 1 : 0.55), 0);
export const tooLong = (n: number) => `太长了：不超过 ${n} 个汉字宽（英文约 ${Math.floor(n / 0.55)} 个字母）`;
/** 必填的短文本 */
const short = (n: number) => z.string().min(1).refine((s) => textWidth(s) <= n, { message: tooLong(n) });
/** 可以为空的短文本 */
const upto = (n: number) => z.string().refine((s) => textWidth(s) <= n, { message: tooLong(n) });

export const Item = z.object({
  id,
  emoji,
  name: short(10),
  price: z.number().min(0),
  spec: upto(80).default(''),
  /** 价格是否为估算（默认是）。只有给出来源的才算非估算 */
  source: upto(80).optional(),
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
  fact: short(120),
  /** 选完后狐狸说的一句话 */
  tip: upto(28).optional(),
  /** 放入方案的物品；与已有物品同 id 时替换 */
  add: z.array(Item).default([]),
  /** 从方案中移除的物品 id */
  remove: z.array(id).default([]),
  /** 不对应具体物品的价格调整（如规模变化） */
  price: z.number().default(0),
  set: z.array(id).default([]),
  score: Score.default({}),
  /** 终章里「行业常见做法」卡片上的一句优点 / 缺点 */
  pros: upto(16).optional(),
  cons: upto(16).optional(),
  /** 个性化终章：为什么这条路适合这个用户（引用他说过的话 / 做过的选择） */
  why: upto(30).optional(),
  /** 个性化终章：按用户的情况最合适的那条 */
  best: z.boolean().optional(),
});
export type Option = z.infer<typeof Option>;

export const Gamble = z.object({
  emoji: emoji.default('🎲'),
  label: short(8),
  fact: upto(120).default(''),
  /** 'always' 必翻车；数组 = 命中其中任一标记时翻车；空数组 = 不会翻车，只是风险 */
  crash_if: z.union([z.literal('always'), z.array(id)]).default([]),
  crash: upto(28).default(''),
  loss: z.number().min(0).default(0),
  ok: upto(28).default(''),
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
  unit: upto(6).default(''),
  /** 事实模板，{v} 会被替换为数值 */
  fact: upto(80),
});
export const FixRound = z.object({
  type: z.literal('fix'),
  ...base,
  /** 出问题的那个东西 */
  problem: short(12),
  options: z.array(Option).min(1).max(3),
  gamble: Gamble,
});

// ---------------- 剧情：角色、台词、对话中的提问 ----------------

/** 出场角色：从固定角色库里挑，as 是他在这个故事里的身份（如「爸爸」「农资店老板」） */
export const CastMember = z.object({ id: z.enum(CHARACTER_IDS), as: short(8).optional() });
export type CastMember = z.infer<typeof CastMember>;
/** 不用写进 cast 也能说话的：me（用户本人）、narrator（旁白）、向导 */
export const RESERVED_SPEAKERS = ['me', 'narrator', GUIDE] as const;

export const Line = z.object({ who: id, say: short(40), mood: z.enum(MOODS).optional(), if: Cond.optional() });
export type Line = z.infer<typeof Line>;

/** 对话里的回答选项：比卡片标签长一点，可以带角色的即时反应 */
export const Reply = Option.extend({
  label: short(14),
  reply: z.array(Line).default([]),
  /** 用户选这个回答时，提问者的表情 */
  mood: z.enum(MOODS).optional(),
});
export type Reply = z.infer<typeof Reply>;

/** 让用户用自己的话说。关键词命中会打标记，原话进交付物 */
export const Free = z.object({
  placeholder: upto(20).default('用你自己的话说说…'),
  chips: z.array(short(12)).max(4).default([]),
  /** 事实模板，{v} = 用户原话 */
  fact: upto(80),
  match: z
    .array(
      z.object({
        words: z.array(z.string().min(1)).min(1),
        set: z.array(id).default([]),
        fact: upto(80).optional(),
        reply: z.array(Line).default([]),
      }),
    )
    .default([]),
  /** 没命中任何关键词时角色的反应 */
  reply: z.array(Line).default([]),
  /** 只要用自己的话回答（不管说了什么）就打上的标记 */
  set: z.array(id).default([]),
  /**
   * 用自己的话说了「最想干啥」这种决定路线的事：这几个回合（几个版本的场景）都不合适，
   * 让模型按用户的原话现写一个新场景顶上（id 是 own_ + 第一个的 id，出现条件是 set 里的标记）
   */
  branch: z.array(id).max(3).optional(),
});
export type Free = z.infer<typeof Free>;

export const AskBeat = z.object({
  type: z.literal('ask'),
  id,
  who: id,
  q: short(24),
  options: z.array(Reply).max(4).default([]),
  free: Free.optional(),
  if: Cond.optional(),
});
export type AskBeat = z.infer<typeof AskBeat>;
export const LineBeat = Line.extend({ type: z.literal('line') });

/** 台词可以省略 type：有 q 的是提问，否则是台词 */
export const Beat = z.preprocess(
  (b) => (b && typeof b === 'object' && !('type' in b) ? { ...b, type: 'q' in b ? 'ask' : 'line' } : b),
  z.discriminatedUnion('type', [LineBeat, AskBeat]),
);
export type Beat = z.infer<typeof Beat>;

/** 剧情关：story = 多人小故事（像听力故事），chat = 和一个角色聊天 */
export const TalkRound = z.object({
  type: z.literal('talk'),
  id,
  style: z.enum(['story', 'chat']).default('story'),
  title: short(14),
  emoji,
  /** chat 模式下的聊天对象 */
  with: id.optional(),
  beats: z.array(Beat).min(2).max(24),
  if: Cond.optional(),
});
export type TalkRound = z.infer<typeof TalkRound>;

/** 终章里「AI 出方案前还需要你准备的资料」：用户逐项点 有 / 没有 / 不确定 */
export const Bring = z.object({ id, emoji, label: short(10), fact: short(120) });
export type Bring = z.infer<typeof Bring>;

/** 个性化终章：从用户的回答里读出来的一条需求，用户确认或纠正；from = 依据（他说过的话 / 做过的选择） */
export const Insight = z.object({ id, emoji, text: short(30), from: upto(24).default(''), fact: short(160) });
export type Insight = z.infer<typeof Insight>;

/** 个性化终章：用户的回答里互相打架的两样（如预算 vs 想要的配置），二选一 */
export const Clash = z.object({ id, emoji, q: short(24), a: Option, b: Option });
export type Clash = z.infer<typeof Clash>;

/**
 * 终章（boss，最后一关）：不是打怪，而是把需求说透。
 * ① 回顾已经弄清楚的；② options = 行业里常见的 2–4 种做法（带 pros / cons），用户选一个方向；
 * ③ probe = 针对选的方向再追问 1–3 个更深的问题（可以用 if 按选项的 set 出现）；
 * ④ bring = 出具体方案前还需要用户准备的资料。
 * 老格式（problem + gamble，一个坑来了怎么办）仍然能玩。
 */
export const BossRound = z.object({
  type: z.literal('boss'),
  ...base,
  /** 主持终章的角色（懂行的那位）；不填就是向导 */
  who: id.optional(),
  problem: upto(12).default(''),
  options: z.array(Option).min(1).max(4),
  gamble: Gamble.optional(),
  probe: z.array(Beat).max(10).default([]),
  bring: z.array(Bring).max(5).default([]),
  /** 个性化终章才有：我们读到的你（逐条确认 / 纠正） */
  read: z.array(Insight).max(4).default([]),
  /** 个性化终章才有：回答里的矛盾，二选一 */
  clash: z.array(Clash).max(2).default([]),
});

/** 地图关：在小镇里走动，找几个人打听情况 */
/** 地图场景：决定地面、围墙和点缀物 */
export const SCENES = ['street', 'park', 'home', 'shop', 'office'] as const;
/** 地点的大道具（NPC 就在它旁边）：楼、柜台、车、沙发、长椅、小摊、书桌、货架、餐桌、床 */
export const PROPS = ['building', 'counter', 'car', 'sofa', 'bench', 'kiosk', 'desk', 'shelf', 'table', 'bed'] as const;

/**
 * NPC 送的道具：聊完（满足 if 条件时）递给玩家，效果和普通选项一样——
 * 通常是帮用户省钱/省时间：price 为负数（优惠券、内部价），或者 add 同 id 的便宜替代品、remove 不必要的东西。
 */
export const Gift = Option.extend({ if: Cond.optional(), say: upto(28).optional() });
export type Gift = z.infer<typeof Gift>;

export const MapSpot = z.object({
  id,
  emoji,
  label: short(6),
  who: id,
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  prop: z.enum(PROPS).optional(),
  beats: z.array(Beat).min(1).max(16),
  gift: Gift.optional(),
});
export type MapSpot = z.infer<typeof MapSpot>;

export const MapRound = z.object({
  type: z.literal('map'),
  id,
  title: short(14),
  emoji,
  scene: z.enum(SCENES).default('street'),
  spots: z
    .array(MapSpot)
    .min(2)
    .max(5),
  if: Cond.optional(),
});
export type MapRound = z.infer<typeof MapRound>;

/**
 * 连环取舍（借鉴 Reigns）：一张张卡由角色抛出一个两难，左滑/右滑二选一。
 * 屏幕上方四条槽（钱、省心、效果、安全）随选择涨落，哪条先见底就「翻车」——最先撑不住的就是用户最在意的。
 * 左右两个选择就是普通选项：score 改三条槽，price 改钱，也可以 add/remove 物品、set 标记。
 */
export const ChainRound = z.object({
  type: z.literal('chain'),
  id,
  title: short(14),
  emoji,
  cards: z
    .array(
      z.object({
        id,
        who: id,
        say: short(40),
        emoji,
        left: Option,
        right: Option,
        /** 满足条件才出现这张卡（不同选择走不同的分支） */
        if: Cond.optional(),
      }),
    )
    .min(3)
    .max(8),
  if: Cond.optional(),
});
export type ChainRound = z.infer<typeof ChainRound>;

/**
 * 整理归类（借鉴 A Little to the Left）：把卡片拖进几个筐（默认「必须 / 最好有 / 不要」）。没有标准答案。
 * 卡片带 item 时：放进 keep 的筐 = 放入方案，放进不 keep 的筐 = 从方案里拿掉。
 * 每张卡放进哪个筐会自动打上标记「卡片id_筐id」，后面的回合可以用 if 引用。
 */
export const SortRound = z.object({
  type: z.literal('sort'),
  id,
  q: short(14),
  emoji,
  bins: z
    .array(z.object({ id, label: short(6), emoji, keep: z.boolean().default(true) }))
    .min(2)
    .max(3),
  cards: z
    .array(z.object({ id, emoji, label: short(8), fact: short(120), item: Item.optional() }))
    .min(3)
    .max(8),
  if: Cond.optional(),
});
export type SortRound = z.infer<typeof SortRound>;

/**
 * 摆进生活（借鉴 Unpacking）：一个场景（房间/院子/办公室/街上）里有几个位置，把东西拖到你会放的地方。
 * 放在哪儿说明了空间、场景、谁在用。某些位置不适合某些东西（bad），放上去会晃一下并提示 warn，用户可以挪走。
 * 每次摆放打标记「东西id_位置id」。
 */
export const PlaceRound = z.object({
  type: z.literal('place'),
  id,
  title: short(14),
  emoji,
  scene: z.enum(['room', 'yard', 'office', 'street']).default('room'),
  zones: z
    .array(
      z.object({
        id,
        label: short(6),
        emoji,
        x: z.number().min(5).max(95),
        y: z.number().min(10).max(80),
        /** 这个位置的特点（给下游 AI） */
        fact: upto(80).default(''),
        /** 不适合放在这里的东西 */
        bad: z.array(id).default([]),
        warn: upto(28).default(''),
        /** 满足条件时这个位置是锁住的（灰掉、放不进去），比如「没有固定车位」 */
        lockIf: Cond.optional(),
        lockNote: upto(28).default(''),
      }),
    )
    .min(2)
    .max(5),
  things: z.array(z.object({ id, emoji, label: short(8), fact: short(120) })).min(1).max(6),
  if: Cond.optional(),
});
export type PlaceRound = z.infer<typeof PlaceRound>;

/**
 * 无文字的一天（借鉴 Florence）：天色从早到晚变化，每个时刻点一个大图标表示你会怎么过/怎么用。
 * 选项就是普通选项（label 只做小字注释和给 AI 的说明），要选清楚一看就懂的 emoji。
 */
export const DayRound = z.object({
  type: z.literal('day'),
  id,
  title: short(14),
  emoji,
  /** 场景：daily 平常的一天；road 路上（高速、堵车、服务区）；outdoor 户外；home 家里 */
  scene: z.enum(['daily', 'road', 'outdoor', 'home']).default('daily'),
  moments: z
    .array(
      z.object({
        id,
        at: z.enum(['morning', 'noon', 'evening', 'night']),
        /** 钟上显示的时间，如 04:30（不填按早中晚夜给默认时间） */
        time: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
        /** 这个时刻场景里的道具 */
        emoji,
        options: z.array(Option).min(2).max(3),
      }),
    )
    .min(3)
    .max(6),
  if: Cond.optional(),
});
export type DayRound = z.infer<typeof DayRound>;

/** 文牒登记自动打的标记：有孩子、一个人、人多、短途（≤2 晚）、长一点（≥4 晚）、旅居（≥10 晚） */
export const TRIP_FLAGS = ['kids', 'solo', 'group', 'short', 'long', 'stay'] as const;
const MMDD = z.string().regex(/^\d\d-\d\d$/);

/**
 * 文牒登记：旅行的硬条件——哪天到（具体日期，或者只知道几月）、住几晚、几个大人几个孩子、几间房。
 * 订酒店、订门票、找导游都要按这些检索。方案里跟着天数 / 人数走的东西自动算价（scale），
 * 日期落在哪个季节（seasons）、人数和天数（TRIP_FLAGS）自动打标记，后面的回合可以用 if 引用。
 */
export const TripRound = z.object({
  type: z.literal('trip'),
  id,
  title: short(14),
  emoji,
  /** 谁来登记，和他说的一句开场白 */
  who: id.optional(),
  say: upto(40).optional(),
  /**
   * 方案里哪些东西按天数 / 人数算钱：room_night 每间每晚、person_day 每人每天、person 每人一次。
   * name 里的 {n} 换成晚数 / 天数 / 人数（如「酒店{n}晚」）
   */
  scale: z.array(z.object({ item: id, per: z.enum(['room_night', 'person_day', 'person']), price: z.number().min(0), name: upto(10).optional() })).default([]),
  /** 日期（或月份）落在这个区间就打上标记，MM-DD，可以跨年（如 11-01 到 03-15） */
  seasons: z.array(z.object({ set: id, from: MMDD, to: MMDD })).default([]),
  if: Cond.optional(),
});
export type TripRound = z.infer<typeof TripRound>;

export const Round = z.discriminatedUnion('type', [PickRound, SwipeRound, SliderRound, FixRound, BossRound, TalkRound, MapRound, ChainRound, SortRound, PlaceRound, DayRound, TripRound]);
export type Round = z.infer<typeof Round>;
export type PickRound = z.infer<typeof PickRound>;
export type SwipeRound = z.infer<typeof SwipeRound>;
export type SliderRound = z.infer<typeof SliderRound>;
export type FixRound = z.infer<typeof FixRound>;
export type BossRound = z.infer<typeof BossRound>;

/** 一个回合里的所有对话（剧情、地图各地点、终章的追问） */
export function beatsOf(r: Round): Beat[] {
  return r.type === 'talk' ? r.beats : r.type === 'map' ? r.spots.flatMap((s) => s.beats) : r.type === 'boss' ? r.probe : [];
}

/** 一关里所有的提问台词（地图关展开每个地点） */
export function asksOf(r: Round): AskBeat[] {
  const beats = beatsOf(r);
  return beats.filter((b): b is AskBeat => b.type === 'ask');
}
export function linesOf(r: Round): Line[] {
  const beats = beatsOf(r);
  return [
    ...beats.filter((b) => b.type === 'line'),
    ...asksOf(r).flatMap((a) => [...a.options.flatMap((o) => o.reply), ...(a.free ? [...a.free.reply, ...a.free.match.flatMap((m) => m.reply)] : [])]),
  ];
}

/** 关卡的结构（不含跨字段校验），用作 MCP 工具的输入 schema */
export const LessonShape = z.object({
    v: z.literal(1),
    need: short(200),
    title: short(14),
    emoji,
    domain: upto(40).default(''),
    lang: z.enum(LANGS).default('zh'),
    currency: z.string().length(3).default('CNY'),
    /**
     * 这关拿什么当「预算」。不填 = 钱（按 currency 显示）。
     * 不涉及花钱的需求（早睡早起、学习计划…）填一种可数的资源，比如每天的分钟数、精力点，
     * 之后所有 price / 预算滑块 / 合计都按这个单位算和显示。
     */
    goal: z.object({ name: short(4), unit: short(4), emoji }).optional(),
    /** 最多 6 个，被请进来帮忙的熟人可以再加 2 个 */
    cast: z.array(CastMember).max(8).default([]),
    guess: z.object({
      line: short(28),
      items: z.array(Item).min(2).max(8),
    }),
    rounds: z.array(Round).min(3).max(20),
    secret: upto(60).optional(),
    /** 我们手写、审过的标杆关：终章不再让模型重写 */
    curated: z.boolean().optional(),
    /** 旅游关的城市 id（对应 src/travel/cities），结算页按它给预订入口 */
    city: id.optional(),
});

export const Lesson = LessonShape.superRefine((l, ctx) => {
    const err = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
    const seen = new Set<string>();
    l.rounds.forEach((r, i) => {
      if (seen.has(r.id)) err(['rounds', i, 'id'], `回合 id 重复: ${r.id}`);
      seen.add(r.id);
      if (r.type === 'slider' && r.min >= r.max) err(['rounds', i], 'min 必须小于 max');
    });
    // 每个被条件引用的标记都应该能被某个选项设置出来，否则那一关永远不会出现
    const settable = new Set(
      l.rounds.flatMap((r) => [
        ...(r.type === 'pick' || r.type === 'fix' || r.type === 'boss' ? r.options.flatMap((o) => o.set) : []),
        ...(r.type === 'boss' ? r.clash.flatMap((c) => [...c.a.set, ...c.b.set]) : []),
        ...(r.type === 'swipe' ? [...r.yes.set, ...r.no.set] : []),
        ...(r.type === 'chain' ? r.cards.flatMap((c) => [...c.left.set, ...c.right.set]) : []),
        ...(r.type === 'sort' ? r.cards.flatMap((c) => r.bins.map((b) => `${c.id}_${b.id}`)) : []),
        ...(r.type === 'place' ? r.things.flatMap((t) => r.zones.map((z) => `${t.id}_${z.id}`)) : []),
        ...(r.type === 'day' ? r.moments.flatMap((m) => m.options.flatMap((o) => o.set)) : []),
        ...(r.type === 'trip' ? [...TRIP_FLAGS, ...r.seasons.map((s) => s.set)] : []),
        ...(r.type === 'map' ? r.spots.flatMap((s) => s.gift?.set ?? []) : []),
        ...asksOf(r).flatMap((a) => [...a.options.flatMap((o) => o.set), ...(a.free?.match.flatMap((m) => m.set) ?? []), ...(a.free?.set ?? [])]),
      ]),
    );
    const checkCond = (c: Cond | undefined, path: (string | number)[]) =>
      [...(c?.all ?? []), ...(c?.any ?? [])].forEach((f) => {
        if (!settable.has(f)) err(path, `标记 ${f} 没有任何选项会设置`);
      });
    const speakers = new Set<string>([...RESERVED_SPEAKERS, ...l.cast.map((c) => c.id)]);
    l.rounds.forEach((r, i) => {
      checkCond(r.if, ['rounds', i, 'if']);
      beatsOf(r).forEach((b) => checkCond(b.if, ['rounds', i, 'beats']));
      linesOf(r).forEach((b) => checkCond(b.if, ['rounds', i, 'reply']));
      if (r.type === 'chain') r.cards.forEach((c, j) => checkCond(c.if, ['rounds', i, 'cards', j, 'if']));
      if (r.type === 'place') r.zones.forEach((z, j) => checkCond(z.lockIf, ['rounds', i, 'zones', j, 'lockIf']));
      if (r.type === 'boss' && r.who && !speakers.has(r.who)) err(['rounds', i, 'who'], `角色 ${r.who} 不在 cast 里`);
      if (r.type === 'map') r.spots.forEach((s, j) => checkCond(s.gift?.if, ['rounds', i, 'spots', j, 'gift', 'if']));
      [...linesOf(r), ...asksOf(r)].forEach((b) => {
        if (!speakers.has(b.who)) err(['rounds', i], `角色 ${b.who} 不在 cast 里`);
      });
      if (r.type === 'talk' && r.with && !speakers.has(r.with)) err(['rounds', i, 'with'], `角色 ${r.with} 不在 cast 里`);
      if (r.type === 'map') r.spots.forEach((s, j) => !speakers.has(s.who) && err(['rounds', i, 'spots', j], `角色 ${s.who} 不在 cast 里`));
      if (r.type === 'chain') r.cards.forEach((c, j) => !speakers.has(c.who) && err(['rounds', i, 'cards', j], `角色 ${c.who} 不在 cast 里`));
      if (r.type === 'place') r.zones.forEach((z, j) => z.bad.forEach((b) => !r.things.some((t) => t.id === b) && err(['rounds', i, 'zones', j], `bad 里的 ${b} 不是这一关的东西`)));
      if (r.type === 'sort' || r.type === 'chain' || r.type === 'place' || r.type === 'day') {
        const ids = r.type === 'place' ? r.things.map((c) => c.id) : r.type === 'day' ? r.moments.map((c) => c.id) : r.cards.map((c) => c.id);
        if (new Set(ids).size !== ids.length) err(['rounds', i], '同一关里卡片 id 重复');
      }
      const askIds = asksOf(r).map((a) => a.id);
      if (new Set(askIds).size !== askIds.length) err(['rounds', i], '同一关里提问 id 重复');
      asksOf(r).forEach((a) => {
        if (!a.options.length && !a.free) err(['rounds', i], `提问 ${a.id} 既没有选项也不允许自由回答`);
        for (const b of a.free?.branch ?? []) if (!l.rounds.some((x) => x.id === b && x.type === 'map')) err(['rounds', i], `提问 ${a.id} 的 branch 里 ${b} 不是这一关的地图回合`);
        if (a.free?.branch?.length && !a.free.set.length) err(['rounds', i], `提问 ${a.id} 有 branch 就要有 set（新场景靠这个标记出现）`);
      });
    });
    // 「换成便宜的」写成了新 id 又没移除旧的：两样都算钱，省钱方案反而加钱
    const guessByEmoji = new Map(l.guess.items.map((g) => [g.emoji, g]));
    const guessIds = new Set(l.guess.items.map((g) => g.id));
    l.rounds.forEach((r, i) => {
      const opts =
        r.type === 'pick' || r.type === 'fix' || r.type === 'boss' ? r.options :
        r.type === 'swipe' ? [r.yes, r.no] :
        r.type === 'chain' ? r.cards.flatMap((c) => [c.left, c.right]) :
        r.type === 'day' ? r.moments.flatMap((m) => m.options) :
        r.type === 'map' ? r.spots.flatMap((s) => (s.gift ? [s.gift] : [])) : [];
      opts.forEach((o) =>
        o.add.forEach((it) => {
          const old = guessByEmoji.get(it.emoji);
          if (old && !guessIds.has(it.id) && !o.remove.includes(old.id))
            err(['rounds', i], `选项 ${o.id} 新增的 ${it.id} 像是替换 ${old.id}（同一个 emoji），但用了新 id 又没 remove ${old.id}，两样都会算钱。替换请用相同 id "${old.id}"，或把 "${old.id}" 放进 remove；真是额外新增就换一个 emoji`);
        }),
      );
    });
    if (!l.rounds.some((r) => r.type === 'boss')) err(['rounds'], '至少需要一个 boss 回合');
  });
export type Lesson = z.infer<typeof Lesson>;

/** 失败时带上解析出来的原始数据和结构化错误，方便自动修补（salvage）和给模型指出具体哪段文字有问题 */
export type ParseResult = { ok: true; lesson: Lesson } | { ok: false; errors: string[]; data?: unknown; issues?: z.ZodIssue[] };

/**
 * 修「字符串里没转义的英文双引号」——模型最常犯的 JSON 错误（如 低嘌呤"饮食"）。
 * 在字符串里遇到 " 时往后看：后面紧跟 , } ] : （再往后是下一个键/值）才是真的收尾，否则是正文里的引号，换成「」。
 * 通用的 jsonrepair 在这种情况下会猜错字符串的结尾，把后面整段回合吞掉，所以先用这个。返回修好的文字和改了几处。
 */
export function fixInnerQuotes(text: string): { text: string; fixed: number } {
  let out = '';
  let inStr = false;
  let open = true; // 下一个正文引号是开引号「还是关引号」
  let fixed = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!inStr) {
      out += ch;
      if (ch === '"') {
        inStr = true;
        open = true;
      }
      continue;
    }
    if (ch === '\\') {
      out += ch + (text[i + 1] ?? '');
      i++;
      continue;
    }
    if (ch !== '"') {
      out += ch;
      continue;
    }
    // 看后面第一个非空白字符
    let j = i + 1;
    while (j < text.length && /\s/.test(text[j])) j++;
    const next = text[j];
    let closes = next === undefined || next === '}' || next === ']' || next === ':';
    if (next === ',') {
      // 逗号后面应该是下一个值 / 键：引号、括号、数字、true/false/null
      let k = j + 1;
      while (k < text.length && /\s/.test(text[k])) k++;
      closes = /["{[\d\-tfn]/.test(text[k] ?? '"');
    }
    if (closes) {
      out += ch;
      inStr = false;
    } else {
      out += open ? '「' : '」';
      open = !open;
      fixed++;
    }
  }
  return { text: out, fixed };
}

export function parseLesson(input: unknown): ParseResult {
  let data = input;
  if (typeof input === 'string') {
    const m = input.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    const text = m ? m[1] : input;
    try {
      data = JSON.parse(text);
    } catch (e) {
      // 模型常犯的小毛病：先修字符串里没转义的 "；还不行再交给 jsonrepair（多余的逗号、被截断的结尾…）
      try {
        const q = fixInnerQuotes(text);
        try {
          data = JSON.parse(q.text);
        } catch {
          data = JSON.parse(jsonrepair(q.text));
        }
      } catch {
        return { ok: false, errors: [`不是合法 JSON：${(e as Error).message}`] };
      }
    }
  }
  const r = Lesson.safeParse(migrateIds(data));
  return r.success
    ? { ok: true, lesson: r.data }
    : { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.') || '根'}：${i.message}`), data, issues: r.error.issues };
}

/** 旧角色 id 换成新阵容（旧关卡、服务器缓存、模型偶尔还用旧名字）；同一个人被映射两次时 cast 去重；顺手去掉值为 null 的字段 */
export function migrateIds(data: unknown): unknown {
  const walk = (n: unknown): unknown => {
    if (Array.isArray(n)) return n.map(walk);
    if (!n || typeof n !== 'object') return n;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
      // 结构化输出里没填的可选字段会是 null（如 "goal": null），当作没写
      if (v === null) continue;
      if ((k === 'who' || k === 'with') && typeof v === 'string') out[k] = LEGACY_IDS[v] ?? v;
      else if (k === 'cast' && Array.isArray(v)) {
        const seen = new Set<string>();
        out[k] = v
          .map((c) => (c && typeof c === 'object' && typeof (c as { id?: unknown }).id === 'string' ? { ...c, id: LEGACY_IDS[(c as { id: string }).id] ?? (c as { id: string }).id } : c))
          .filter((c) => !(c as { id?: string })?.id || (!seen.has((c as { id: string }).id) && seen.add((c as { id: string }).id)));
      } else out[k] = walk(v);
    }
    return out;
  };
  return walk(data);
}
