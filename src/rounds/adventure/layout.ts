import type { MapRound, MapSpot } from '../../lesson/schema';
import { BEHIND, PROP_SIZE, type DecorKind, type PropKind } from './props';

/**
 * 把地图关的几个地点摆进一块 7×9 的格子场地：每个地点一件大道具 + 一个 NPC + 一块「说话站位」，
 * 再按场景撒点树、灯、盆栽，保证从入口走得到每一个 NPC。纯函数，方便测。
 */

export const COLS = 7;
export const ROWS = 9;
export type Cell = { c: number; r: number };
export const key = (c: number, r: number) => `${c},${r}`;

export type Placed = {
  spot: MapSpot;
  kind: PropKind;
  /** 道具左上角所在格 */
  c: number;
  r: number;
  w: number;
  /** NPC 站的格 */
  npc: Cell;
  behind: boolean;
  /** 玩家走到这里就能和 NPC 说话 */
  talk: Cell;
};

export type Layout = {
  placed: Placed[];
  decor: { kind: DecorKind | 'shelf'; c: number; r: number }[];
  blocked: Set<string>;
  start: Cell;
};

const BY_EMOJI: [string, PropKind][] = [
  ['🏢🏬🏦🏫🏥🏛️🏤🏨🏣🏰⛪🏭', 'building'],
  ['🚗🚘🚙🛻🚕🚐🏎️🚚', 'car'],
  ['🏠🏡🛋️👨‍👩‍👧👪', 'sofa'],
  ['🏪🛒🍜🍔☕🥤🍦🧋🏮🥡🍢🌭🥐🍞🧺🐟🥬', 'kiosk'],
  ['💻🖥️⌨️🧑‍💻📊', 'desk'],
  ['🌳🏞️⛲🌲🌷🌸', 'bench'],
  ['🍽️🍲🍱🥘', 'table'],
  ['🛏️😴', 'bed'],
  ['📦🧴🛍️📚🧸🎁', 'shelf'],
];

export function propFor(spot: MapSpot): PropKind {
  if (spot.prop) return spot.prop;
  for (const [list, kind] of BY_EMOJI) if ([...spot.emoji].some((ch) => ch.trim() && list.includes(ch))) return kind;
  return 'counter';
}

const DECOR: Record<MapRound['scene'], (DecorKind | 'shelf')[]> = {
  street: ['tree', 'lamp', 'bin', 'bush', 'tree', 'flowers', 'lamp', 'bush'],
  park: ['tree', 'bush', 'flowers', 'tree', 'bush', 'lamp', 'flowers', 'tree'],
  home: ['plant', 'plant', 'shelf', 'lamp', 'plant'],
  shop: ['plant', 'cooler', 'plant', 'bin'],
  office: ['plant', 'cooler', 'plant', 'bin', 'plant'],
};

/** 可复现的随机数：同一关每次摆出来一样 */
function rng(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const inside = (c: number, r: number) => c >= 0 && c < COLS && r >= 0 && r < ROWS;

/** 宽度优先找路（上下左右走），返回不含起点的格子序列；走不到返回 null */
export function findPath(from: Cell, to: Cell, blocked: Set<string>): Cell[] | null {
  if (from.c === to.c && from.r === to.r) return [];
  if (blocked.has(key(to.c, to.r)) || !inside(to.c, to.r)) return null;
  const prev = new Map<string, string>();
  const seen = new Set([key(from.c, from.r)]);
  const q: Cell[] = [from];
  while (q.length) {
    const cur = q.shift()!;
    for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const n = { c: cur.c + dc, r: cur.r + dr };
      const k = key(n.c, n.r);
      if (!inside(n.c, n.r) || blocked.has(k) || seen.has(k)) continue;
      seen.add(k);
      prev.set(k, key(cur.c, cur.r));
      if (n.c === to.c && n.r === to.r) {
        const path: Cell[] = [];
        let at: string | undefined = k;
        while (at && at !== key(from.c, from.r)) {
          const [c, r] = at.split(',').map(Number);
          path.unshift({ c, r });
          at = prev.get(at);
        }
        return path;
      }
      q.push(n);
    }
  }
  return null;
}

export function layoutMap(round: MapRound): Layout {
  const blocked = new Set<string>();
  const reserved = new Set<string>();
  const start = { c: Math.floor(COLS / 2), r: ROWS - 1 };
  reserved.add(key(start.c, start.r));
  const placed: Placed[] = [];

  for (const spot of round.spots) {
    const kind = propFor(spot);
    const w = PROP_SIZE[kind].w;
    const behind = !!BEHIND[kind];
    const want = { c: Math.round((spot.x / 100) * (COLS - w)), r: Math.round(Math.min(1, Math.max(0, (spot.y - 12) / 66)) * (ROWS - 4)) };
    // 从想要的位置往外找一个放得下的地方
    const candidates: Cell[] = [];
    for (let r = 0; r <= ROWS - 4; r++) for (let c = 0; c <= COLS - w; c++) candidates.push({ c, r });
    candidates.sort((a, b) => Math.hypot(a.c - want.c, (a.r - want.r) * 1.2) - Math.hypot(b.c - want.c, (b.r - want.r) * 1.2));
    for (const at of candidates) {
      const foot = Array.from({ length: w }, (_, i) => ({ c: at.c + i, r: at.r }));
      // NPC 站在靠场地中间的那一侧
      const nc = w > 1 && at.c + w / 2 <= COLS / 2 ? at.c + w - 1 : at.c;
      const npc = behind ? { c: nc, r: at.r } : { c: nc, r: at.r + 1 };
      const talk = behind ? { c: nc, r: at.r + 1 } : { c: nc, r: at.r + 2 };
      // 道具四周留一圈（左右各一格）不和别的道具挤在一起
      const halo = [{ c: at.c - 1, r: at.r }, { c: at.c + w, r: at.r }];
      const need = [...foot, npc, talk];
      if (!need.every((x) => inside(x.c, x.r) && !blocked.has(key(x.c, x.r)) && !reserved.has(key(x.c, x.r)))) continue;
      if (halo.some((x) => blocked.has(key(x.c, x.r)))) continue;
      const cells = [...foot, npc].map((x) => key(x.c, x.r));
      cells.forEach((k) => blocked.add(k));
      // 放下以后，之前的 NPC 和这个 NPC 都还得走得到
      if (![...placed.map((p) => p.talk), talk].every((t) => findPath(start, t, blocked))) {
        cells.forEach((k) => blocked.delete(k));
        continue;
      }
      reserved.add(key(talk.c, talk.r));
      placed.push({ spot, kind, c: at.c, r: at.r, w, npc, behind, talk });
      break;
    }
  }

  // 撒点缀：一件一件放，放了以后还得每个 NPC 都走得到，否则撤掉
  const rand = rng(round.id);
  const decor: Layout['decor'] = [];
  const kinds = DECOR[round.scene] ?? DECOR.street;
  const free: Cell[] = [];
  for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS; c++) if (!blocked.has(key(c, r)) && !reserved.has(key(c, r))) free.push({ c, r });
  // 先放边上（像围栏边的树），再放中间
  free.sort((a, b) => {
    const edge = (x: Cell) => (x.c === 0 || x.c === COLS - 1 || x.r === 0 ? 0 : 1);
    return edge(a) - edge(b) || rand() - 0.5;
  });
  const reachable = () => placed.every((p) => findPath(start, p.talk, blocked) !== null);
  for (const cell of free) {
    if (decor.length >= kinds.length) break;
    // 不挨着 NPC 的说话站位，免得挡路
    if (placed.some((p) => Math.abs(p.talk.c - cell.c) + Math.abs(p.talk.r - cell.r) <= 1)) continue;
    if (decor.some((d) => Math.abs(d.c - cell.c) + Math.abs(d.r - cell.r) <= 1)) continue;
    const k = key(cell.c, cell.r);
    blocked.add(k);
    if (!reachable()) {
      blocked.delete(k);
      continue;
    }
    decor.push({ kind: kinds[decor.length], c: cell.c, r: cell.r });
  }
  return { placed, decor, blocked, start };
}

/** 玩家站在这里能不能和这个 NPC 说话 */
export function canTalk(p: Placed, at: Cell): boolean {
  if (at.c === p.talk.c && at.r === p.talk.r) return true;
  if (p.behind) return at.r === p.r + 1 && at.c >= p.c && at.c < p.c + p.w;
  return Math.abs(at.c - p.npc.c) + Math.abs(at.r - p.npc.r) === 1;
}
