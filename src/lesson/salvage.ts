import type { ZodIssue } from 'zod';
import { CHARACTER_IDS } from '../chars/library';
import { Lesson, textWidth, type Lesson as LessonT, type Round } from './schema';

/**
 * 自动修补模型写的关卡：大多数校验错误是小毛病（某句话超了几个字、chips 多给了一个、卡片少写一边），
 * 让模型重写一遍要 15~20 秒还常常改不对，不如在这里直接修。
 *
 * 轻修（不改变玩法）：截短文字、截掉超出上限的数组项、补 cast、重命名重复 id、修正「替换」的 id、去掉引用不到的标记。
 * 重修（丢内容）：删掉有缺项的元素（一张卡、一个选项），实在不行删掉整个回合（boss 除外）。
 */

type Json = Record<string, unknown> | unknown[];
export type Salvaged = { lesson: LessonT; fixes: string[]; heavy: boolean };

const MAX_PASSES = 40;

/** 截到显示宽度 n 以内，末尾补省略号 */
function clip(s: string, n: number): string {
  let out = '';
  for (const c of s) {
    if (textWidth(out + c) > n - 0.6) break;
    out += c;
  }
  return out.replace(/[，,、。.；;：:\s]+$/, '') + '…';
}

function at(root: unknown, path: (string | number)[]): unknown {
  return path.reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string | number, unknown>)[k] : undefined), root);
}

/** 从 path 往上找最近的「数组里的一个元素」，删掉它；回合数组只删非 boss 回合 */
function dropNearest(root: Record<string, unknown>, path: (string | number)[], fixes: string[]): boolean {
  for (let i = path.length - 1; i >= 1; i--) {
    const idx = path[i];
    if (typeof idx !== 'number') continue;
    const arr = at(root, path.slice(0, i));
    if (!Array.isArray(arr) || idx >= arr.length) continue;
    // 回合：boss 不能删
    if (i === 1 && path[0] === 'rounds') {
      const r = arr[idx] as { type?: string; id?: string };
      if (r?.type === 'boss') return false;
      arr.splice(idx, 1);
      fixes.push(`删掉了回合 ${r?.id ?? idx}`);
      return true;
    }
    arr.splice(idx, 1);
    fixes.push(`删掉了 ${path.slice(0, i + 1).join('.')}`);
    return true;
  }
  return false;
}

/** 把某个标记从所有条件里去掉（产生它的回合被删了，或模型写错了名字） */
function stripFlag(node: unknown, flag: string) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((n) => stripFlag(n, flag));
  const o = node as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) {
    if (k === 'if' && v && typeof v === 'object') {
      for (const key of ['all', 'any', 'none'])
        if (Array.isArray((v as Record<string, unknown>)[key])) (v as Record<string, string[]>)[key] = (v as Record<string, string[]>)[key].filter((f) => f !== flag);
    } else stripFlag(v, flag);
  }
}

function fix(root: Record<string, unknown>, issue: ZodIssue, fixes: string[]): { ok: boolean; heavy: boolean } {
  const path = issue.path;
  const parent = at(root, path.slice(0, -1)) as Json | undefined;
  const key = path.at(-1)!;
  const value = at(root, path);
  const msg = issue.message;

  // 文字太长 → 截短
  const width = msg.match(/不超过 (\d+) 个汉字宽/);
  if (width && typeof value === 'string' && parent) {
    (parent as Record<string | number, unknown>)[key] = clip(value, Number(width[1]));
    fixes.push(`截短了 ${path.join('.')}`);
    return { ok: true, heavy: false };
  }
  // 数组超长 → 截掉多的
  if (issue.code === 'too_big' && issue.type === 'array' && Array.isArray(value)) {
    value.length = Number(issue.maximum);
    fixes.push(`${path.join('.')} 只保留前 ${issue.maximum} 项`);
    return { ok: true, heavy: false };
  }
  // 角色不在 cast 里 → 是库里的角色就补进 cast
  const who = msg.match(/角色 (\w+) 不在 cast 里/);
  if (who && (CHARACTER_IDS as string[]).includes(who[1])) {
    const cast = (root.cast ??= []) as { id: string }[];
    if (cast.length < 6 && !cast.some((c) => c.id === who[1])) {
      cast.push({ id: who[1] });
      fixes.push(`把 ${who[1]} 加进了 cast`);
      return { ok: true, heavy: false };
    }
  }
  // 条件里的标记没有任何选项会设置 → 去掉这个条件
  const flag = msg.match(/标记 (\w+) 没有任何选项会设置/);
  if (flag) {
    stripFlag(root, flag[1]);
    fixes.push(`去掉了引用不到的标记 ${flag[1]}`);
    return { ok: true, heavy: false };
  }
  // 「便宜的替换」用了新 id → 改成被替换物品的 id
  const swap = msg.match(/新增的 (\w+) 像是替换 (\w+)/);
  if (swap) {
    const rounds = root.rounds as Record<string, unknown>[];
    const walk = (n: unknown) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach(walk);
      const o = n as Record<string, unknown>;
      if (Array.isArray(o.add)) for (const it of o.add as { id?: string }[]) if (it?.id === swap[1]) it.id = swap[2];
      Object.values(o).forEach(walk);
    };
    walk(rounds[path[1] as number]);
    fixes.push(`把 ${swap[1]} 改成替换 ${swap[2]}`);
    return { ok: true, heavy: false };
  }
  // 重复 id → 加后缀
  if (/id 重复/.test(msg)) {
    const arr = (path[0] === 'rounds' && path.length <= 2 ? root.rounds : at(root, path)) as { id?: string }[] | undefined;
    const list = Array.isArray(arr) ? arr : (at(root, path) as Record<string, unknown> | undefined)?.cards ?? (at(root, path) as Record<string, unknown> | undefined)?.things;
    if (Array.isArray(list)) {
      const seen = new Set<string>();
      for (const x of list as { id?: string }[]) {
        if (!x?.id) continue;
        let id = x.id;
        for (let n = 2; seen.has(id); n++) id = `${x.id}_${n}`;
        x.id = id;
        seen.add(id);
      }
      fixes.push(`重命名了重复的 id（${path.join('.')}）`);
      return { ok: true, heavy: false };
    }
  }
  // 「bad 里的 x 不是这一关的东西」→ 去掉
  const bad = msg.match(/bad 里的 (\w+)/);
  if (bad && parent && Array.isArray((value as Record<string, unknown>)?.bad)) {
    (value as Record<string, string[]>).bad = (value as Record<string, string[]>).bad.filter((b) => b !== bad[1]);
    fixes.push(`去掉了 bad 里的 ${bad[1]}`);
    return { ok: true, heavy: false };
  }
  // 滑块 min >= max → 交换
  if (/min 必须小于 max/.test(msg) && value && typeof value === 'object') {
    const r = value as { min: number; max: number };
    [r.min, r.max] = [Math.min(r.min, r.max), Math.max(r.min, r.max) + (r.min === r.max ? 1 : 0)];
    fixes.push(`修正了 ${path.join('.')} 的 min/max`);
    return { ok: true, heavy: false };
  }
  // 其余（缺字段、类型不对、数量太少…）→ 删掉出问题的那个元素
  return { ok: dropNearest(root, path, fixes), heavy: true };
}

export function salvage(data: unknown): Salvaged | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const root = structuredClone(data) as Record<string, unknown>;
  const fixes: string[] = [];
  let heavy = false;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const r = Lesson.safeParse(root);
    if (r.success) {
      // 删得太多就不算数了：至少要有 5 个回合（含 boss）才值得玩
      if (r.data.rounds.length < 5) return null;
      return { lesson: r.data, fixes, heavy };
    }
    const f = fix(root, r.error.issues[0], fixes);
    if (!f.ok) return null;
    heavy ||= f.heavy;
  }
  return null;
}

/** 给模型看的错误：带上出问题的原文和它的宽度，免得它反复犯同一个错 */
export function explainIssues(data: unknown, issues: ZodIssue[]): string[] {
  return issues.slice(0, 30).map((i) => {
    const v = at(data, i.path);
    const where = i.path.join('.') || 'root';
    if (typeof v === 'string' && /不超过 (\d+) 个汉字宽/.test(i.message)) {
      const n = Number(i.message.match(/不超过 (\d+)/)![1]);
      return `${where} = "${v}" is ${textWidth(v).toFixed(1)} wide, the limit is ${n}. Rewrite it shorter (not just cut).`;
    }
    if (i.code === 'too_big' && Array.isArray(v)) return `${where} has ${v.length} items, at most ${i.maximum} allowed.`;
    if (i.code === 'invalid_type' && v === undefined) return `${where} is missing (required).`;
    return `${where}: ${i.message}`;
  });
}

const norm = (s: string) => s.replace(/[\s·・、，,。.!！?？「」“”"']/g, '').toLowerCase();

/**
 * 「再玩一轮」的最后一道保险：新关卡里，用户已经决定过的东西不能再出现在整理归类 / 摆进生活里
 * （模型即使被告知也常常照旧出题）。删掉这些卡片；剩下的卡片不够就删掉整个回合。
 */
export function dropDecided(lesson: LessonT, decided: string[]): { lesson: LessonT; dropped: string[] } {
  const seen = new Set(decided.map(norm).filter(Boolean));
  if (!seen.size) return { lesson, dropped: [] };
  const hit = (...names: (string | undefined)[]) => names.some((n) => n && seen.has(norm(n)));
  const dropped: string[] = [];
  const rounds = lesson.rounds.flatMap<Round>((r) => {
    if (r.type === 'sort') {
      const cards = r.cards.filter((c) => !(hit(c.label, c.item?.name) && dropped.push(c.label)));
      return cards.length >= 3 ? [{ ...r, cards }] : cards.length === r.cards.length ? [r] : [];
    }
    if (r.type === 'place') {
      const things = r.things.filter((t) => !(hit(t.label) && dropped.push(t.label)));
      const ids = new Set(things.map((t) => t.id));
      return things.length ? [{ ...r, things, zones: r.zones.map((z) => ({ ...z, bad: z.bad.filter((b) => ids.has(b)) })) }] : [];
    }
    return [r];
  });
  if (!dropped.length) return { lesson, dropped };
  // 删回合后，引用了那些回合标记的条件可能失效：交给 salvage 再校验一遍
  const fixed = salvage({ ...lesson, rounds });
  return fixed ? { lesson: fixed.lesson, dropped } : { lesson, dropped: [] };
}
