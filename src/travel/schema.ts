import { z } from 'zod';

/**
 * 城市旅游数据：关卡设计和关卡生成的依据（景点、美食、坑点、交通、季节）。
 * 每条都带可信度 conf、来源 src（指向 sources 里的 id）和核实日期；
 * 各网站说法不一致的写进 verify，提醒上线前到官方渠道（官网、官方公众号、12306）核实。
 */

const id = z.string().regex(/^[a-z0-9_]+$/);
const Name = z.object({ en: z.string().min(1), zh: z.string().min(1) });
/** high = 多个来源一致；medium = 来源少或有出入；low = 只有一个来源或凭常识，必须核实 */
const Conf = z.enum(['high', 'medium', 'low']);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** 用户画像标签：关卡里的选择会打上这些标记，用来挑适合的景点和相关的坑 */
export const TAGS = [
  'history', 'food', 'nature', 'night', 'photo', 'active', 'shows',
  'kids', 'seniors', 'mobility_low', 'heights_fear', 'crowd_averse', 'early_bird',
  'budget', 'adventurous', 'halal', 'veg', 'spicy_averse', 'first_timer', 'transit_visa',
] as const;
const Tag = z.enum(TAGS);

const Checked = { conf: Conf, src: z.array(id).min(1), verify: z.string().optional() };

export const Source = z.object({
  id,
  title: z.string(),
  /** team 核实的可以没有网址（写明查的是哪个官方公众号 / 网站） */
  url: z.string().url().optional(),
  /** official 官方；ota 携程/Trip.com 等平台；guide 旅行社/攻略站；blog 个人或小站；team 我们自己到官方渠道核实 */
  kind: z.enum(['official', 'ota', 'guide', 'blog', 'team']),
});

export const Sight = z.object({
  id,
  name: Name,
  kind: z.enum(['museum', 'site', 'wall', 'temple', 'street', 'night', 'show', 'nature', 'daytrip']),
  area: z.string(),
  /** 一句话：为什么值得去（关卡里角色会说的那种） */
  hook: z.string(),
  hours: z.string(),
  closed: z.string().optional(),
  /** 成人票价（人民币）；null = 免费或不适用 */
  ticket: z.object({ cny: z.number().nullable(), note: z.string().optional() }),
  booking: z.object({ required: z.boolean(), how: z.string().optional(), ahead: z.string().optional() }),
  /** 建议游览时长（小时）[最少, 最多]，不含路上 */
  hours_needed: z.tuple([z.number(), z.number()]),
  /** 1 = 冷清，5 = 人山人海 */
  crowd: z.number().int().min(1).max(5),
  /** 1 = 平地散步，5 = 爬山 */
  effort: z.number().int().min(1).max(5),
  best_time: z.string().optional(),
  getting_there: z.string().optional(),
  good_for: z.array(Tag).default([]),
  skip_if: z.array(Tag).default([]),
  pitfalls: z.array(id).default([]),
  ...Checked,
});

export const Food = z.object({
  id,
  name: Name,
  what: z.string(),
  price_cny: z.tuple([z.number(), z.number()]).nullable(),
  spicy: z.number().int().min(0).max(3),
  halal: z.boolean(),
  veg: z.boolean(),
  where: z.string(),
  tip: z.string().optional(),
  ...Checked,
});

/** 坑：关卡里「修坑」回合的原料。affects = 哪些人会踩到 */
export const Pitfall = z.object({
  id,
  title: z.string(),
  situation: z.string(),
  consequence: z.string(),
  fix: z.string(),
  affects: z.array(Tag).default([]),
  /** 1 = 小麻烦，3 = 毁掉一天或白跑一趟 */
  severity: z.number().int().min(1).max(3),
  ...Checked,
});

export const Transport = z.object({
  id,
  route: z.string(),
  mode: z.string(),
  time: z.string(),
  cost: z.string(),
  note: z.string().optional(),
  ...Checked,
});

export const Area = z.object({ id, name: Name, vibe: z.string(), good_for: z.array(Tag).default([]), cons: z.string(), ...Checked });

export const Season = z.object({ months: z.string(), weather: z.string(), crowds: z.string(), note: z.string().optional(), ...Checked });

export const Holiday = z.object({ id, name: z.string(), dates: z.string(), effect: z.string(), ...Checked });

export const City = z
  .object({
    v: z.literal(1),
    id,
    name: Name,
    checked: date,
    summary: z.string(),
    sources: z.array(Source).min(1),
    entry: z.array(Transport),
    get_around: z.array(Transport),
    areas: z.array(Area),
    sights: z.array(Sight).min(1),
    foods: z.array(Food),
    pitfalls: z.array(Pitfall),
    seasons: z.array(Season),
    holidays: z.array(Holiday),
    /** 还没采集的内容，下一轮补 */
    todo: z.array(z.string()).default([]),
  })
  .superRefine((c, ctx) => {
    const src = new Set(c.sources.map((s) => s.id));
    const pits = new Set(c.pitfalls.map((p) => p.id));
    const check = (items: { id: string; src: string[] }[], key: string) =>
      items.forEach((it) =>
        it.src.forEach((s) => !src.has(s) && ctx.addIssue({ code: 'custom', path: [key, it.id], message: `来源 ${s} 不在 sources 里` })),
      );
    check(c.entry, 'entry');
    check(c.get_around, 'get_around');
    check(c.areas, 'areas');
    check(c.sights, 'sights');
    check(c.foods, 'foods');
    check(c.pitfalls, 'pitfalls');
    check(c.holidays, 'holidays');
    c.seasons.forEach((s, i) => s.src.forEach((x) => !src.has(x) && ctx.addIssue({ code: 'custom', path: ['seasons', i], message: `来源 ${x} 不在 sources 里` })));
    c.sights.forEach((s) =>
      s.pitfalls.forEach((p) => !pits.has(p) && ctx.addIssue({ code: 'custom', path: ['sights', s.id], message: `坑 ${p} 不在 pitfalls 里` })),
    );
    const ids = [...c.sights, ...c.foods, ...c.pitfalls].map((x) => x.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: [], message: 'id 重复' });
  });
export type City = z.infer<typeof City>;
