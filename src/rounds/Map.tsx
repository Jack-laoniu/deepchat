import { animate, AnimatePresence, motion, useMotionValue, useTransform, type MotionValue } from 'framer-motion';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Character } from '../chars/Character';
import { sfx } from '../fx/fx';
import { useGame } from '../game';
import { money, t } from '../i18n';
import { matches, walkBeats, type Replies } from '../lesson/engine';
import type { Gift, MapRound } from '../lesson/schema';
import { Emoji } from '../ui/Emoji';
import { Btn } from '../ui/kit';
import { HandHint } from '../ui/Hint';
import { canTalk, COLS, findPath, key, layoutMap, type Cell, type Placed } from './adventure/layout';
import { PROP_SIZE, PropArt } from './adventure/props';
import { Dialogue } from './Talk';

/**
 * 地图关（借鉴多邻国 Adventures）：一块立体的小场地，从斜上方看下去。
 * 玩家点地面，小人沿格子绕开障碍走过去；每个地点守着一个 NPC，头顶 ❗。
 * 走到跟前（或直接点 NPC）就开聊；有的 NPC 聊完会递一件道具（优惠券、内部价…），飞进背包，方案跟着省钱。
 */

/** 场地往后倒的角度：越大越「俯视」 */
const TILT = 26;
/** 走一格多少秒 */
const STEP = 0.2;

type Theme = { floor: string; floorSize: (t: number) => string; outside: string; wall?: string; edge: string };
const THEMES: Record<MapRound['scene'], Theme> = {
  street: {
    floor: 'repeating-conic-gradient(#F7F9FC 0 25%, #E3EBF3 0 50%)',
    floorSize: (t) => `${t * 2}px ${t * 2}px`,
    outside: 'linear-gradient(180deg,#8FD16E,#5DAE45)',
    edge: '#4E9B3A',
  },
  park: {
    floor: 'repeating-conic-gradient(#EEF7DE 0 25%, #DDEFC6 0 50%)',
    floorSize: (t) => `${t * 2}px ${t * 2}px`,
    outside: 'linear-gradient(180deg,#8FD16E,#4E9B3A)',
    edge: '#3F8A30',
  },
  home: {
    floor: 'repeating-linear-gradient(90deg,#E9C9A0 0 48%,#D9B585 48% 50%)',
    floorSize: (t) => `${t}px ${t}px`,
    outside: 'linear-gradient(180deg,#C9A57F,#A9825C)',
    wall: '#F6E7D2',
    edge: '#9C7550',
  },
  shop: {
    floor: 'repeating-conic-gradient(#FFF8EE 0 25%, #F2E2CC 0 50%)',
    floorSize: (t) => `${t * 2}px ${t * 2}px`,
    outside: 'linear-gradient(180deg,#B9C3CF,#8C99A8)',
    wall: '#FCE3D6',
    edge: '#7D8896',
  },
  office: {
    floor: 'repeating-conic-gradient(#F3F5F8 0 25%, #E1E7EE 0 50%)',
    floorSize: (t) => `${t * 2}px ${t * 2}px`,
    outside: 'linear-gradient(180deg,#B9C3CF,#8C99A8)',
    wall: '#DDE9F5',
    edge: '#7D8896',
  },
};

/**
 * 地面是一块倒下去的 3D 平面；立着的东西（道具、人、墙）不放进 3D 里，而是按透视算出脚底在屏幕上的位置和缩放，
 * 当成普通的 2D 图层画，前后顺序直接用脚底离镜头的远近（zIndex）。
 * Safari / 微信内置浏览器给 3D 图层排前后不可靠（按整块中心比远近），柜台后面的人会把腿露到柜台前面来；2D 图层的顺序在所有浏览器里都一样。
 */
type View = { cam: MotionValue<number>; at: (x: number, y: number, cam: number) => { x: number; y: number; s: number } };

/**
 * 立在场地上的东西：底边中点贴着地面 (x + w/2, y)。
 * top 是头顶上方的空间（放招牌、气泡），算在盒子里。
 */
function Stand({ view, x, y, w, h, z = 0, top = 0, above, align = 'center', children, onClick, data }: { view: View; x: number; y: number; w: number; h: number; z?: number; top?: number; above?: ReactNode; align?: 'start' | 'center' | 'end'; children: ReactNode; onClick?: () => void; data?: string }) {
  const H = h + top;
  const transform = useTransform(view.cam, (c) => {
    const p = view.at(x + w / 2, y, c);
    return `translate(${p.x - w / 2}px, ${p.y - H}px) scale(${p.s})`;
  });
  return (
    <motion.div
      data-npc={data}
      onClick={onClick}
      className={`absolute left-0 top-0 ${onClick ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'}`}
      style={{ width: w, height: H, transformOrigin: `${w / 2}px ${H}px`, transform, zIndex: Math.round(y) + z }}
    >
      {above && (
        <div className={`absolute inset-x-0 top-0 flex items-end px-1 ${align === 'start' ? 'justify-start' : align === 'end' ? 'justify-end' : 'justify-center'}`} style={{ height: top }}>
          {above}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0" style={{ height: h }}>
        {children}
      </div>
    </motion.div>
  );
}

/** 跟着 motion value 走的竖立物（玩家） */
function Walker({ view, mx, my, T, w, h, children }: { view: View; mx: MotionValue<number>; my: MotionValue<number>; T: number; w: number; h: number; children: ReactNode }) {
  const transform = useTransform([mx, my, view.cam], ([c, r, cam]: number[]) => {
    const p = view.at((c + 0.5) * T, (r + 0.92) * T, cam);
    return `translate(${p.x - w / 2}px, ${p.y - h}px) scale(${p.s})`;
  });
  const zIndex = useTransform(my, (r) => Math.round((r + 0.92) * T));
  return (
    <motion.div className="pointer-events-none absolute left-0 top-0" style={{ width: w, height: h, transformOrigin: `${w / 2}px ${h}px`, transform, zIndex }}>
      {children}
    </motion.div>
  );
}

/** 地上的影子（贴地，不竖起来） */
function Shadow({ x, y, w, T }: { x: number; y: number; w: number; T: number }) {
  return <div className="pointer-events-none absolute rounded-[40%] bg-black/20 blur-[3px]" style={{ left: x + T * 0.12, top: y - T * 0.32, width: w - T * 0.05, height: T * 0.5, transform: 'translateZ(0.5px)' }} />;
}

/** 多邻国式的黑色对话气泡 */
function Bubble({ children, tone = 'dark', wrap = false }: { children: ReactNode; tone?: 'dark' | 'green'; wrap?: boolean }) {
  return (
    <motion.div
      initial={{ scale: 0, y: 6 }}
      animate={{ scale: 1, y: [0, -4, 0] }}
      exit={{ scale: 0 }}
      transition={{ y: { repeat: Infinity, duration: 1.1 }, scale: { type: 'spring', stiffness: 500, damping: 18 } }}
      className={`relative flex items-center gap-1 rounded-xl px-2 py-0.5 text-sm font-black text-white shadow-lg ${wrap ? 'max-w-full text-center text-xs leading-tight' : 'whitespace-nowrap'} ${tone === 'dark' ? 'bg-slate-800' : 'border-b-4 border-green-700 bg-green-500'}`}
    >
      {children}
      <span className={`absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 ${tone === 'dark' ? 'bg-slate-800' : 'bg-green-500'}`} />
    </motion.div>
  );
}

/** 这件道具会让方案便宜（或贵）多少 */
function giftDelta(gift: Gift, cart: { id: string; price: number }[]) {
  const price = new Map(cart.map((i) => [i.id, i.price]));
  return gift.price + gift.add.reduce((s, it) => s + it.price - (price.get(it.id) ?? 0), 0) - gift.remove.reduce((s, id) => s + (price.get(id) ?? 0), 0);
}

type Flying = { id: string; emoji: string; label: string; delta: number; from: { x: number; y: number } };

export function MapQuest({ round }: { round: MapRound }) {
  const g = useGame();
  const layout = useMemo(() => layoutMap(round), [round]);
  const theme = THEMES[round.scene] ?? THEMES.street;
  const [done, setDone] = useState<Record<string, Replies>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [me, setMe] = useState<Cell>(layout.start);
  const mx = useMotionValue(layout.start.c);
  const my = useMotionValue(layout.start.r);
  const [walking, setWalking] = useState(false);
  const [facing, setFacing] = useState<'left' | 'right'>('right');
  const [back, setBack] = useState(true);
  const [target, setTarget] = useState<Cell | null>(null);
  const [moved, setMoved] = useState(false);
  const [bag, setBag] = useState<{ id: string; emoji: string; label: string; delta: number }[]>([]);
  const [flying, setFlying] = useState<Flying | null>(null);
  const [say, setSay] = useState<{ id: string; text: string } | null>(null);
  const [size, setSize] = useState({ w: 360, h: 480 });
  const box = useRef<HTMLDivElement>(null);
  const walkId = useRef(0);
  const allDone = round.spots.every((s) => done[s.id]);
  const left = round.spots.filter((s) => !done[s.id]).length;
  const enough = round.spots.length > 3 && round.spots.length - left >= 3;
  const spot = round.spots.find((s) => s.id === open);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // 格子按宽度撑满（人物要大，看得清表情）；场地比屏幕高时，镜头跟着人上下走
  const ROWS = layout.rows;
  const cos = Math.cos((TILT * Math.PI) / 180);
  const T = Math.max(30, Math.min(size.w / (COLS + 0.7), size.h / (5.2 * cos + 2.2)));
  const BW = COLS * T;
  const BH = ROWS * T;
  const boardLeft = (size.w - BW) / 2;
  // 场地底边贴住画框底部时的位置（最低），和场地顶部（连后墙）刚好露出时的位置（最高）
  const bottomTop = size.h - BH - T * 0.3;
  const topTop = T * 1.9 - BH * (1 - cos);
  const fits = bottomTop >= topTop;
  const camTop = useTransform(my, (r) => {
    if (fits) return bottomTop;
    const want = size.h * 0.6 - BH + (BH - (r + 0.9) * T) * cos;
    return Math.min(topTop, Math.max(bottomTop, want));
  });
  // 地面层的透视（和下面 perspective / perspectiveOrigin / rotateX 一致）：场地上一点 → 屏幕上的位置和缩放
  const persp = BH * 2.4;
  const sin = Math.sin((TILT * Math.PI) / 180);
  const view: View = {
    cam: camTop,
    at: (x, y, cam) => {
      const dy = y - BH;
      const z = dy * sin;
      const s = persp / (persp - z);
      const ox = size.w / 2;
      const oy = size.h * 0.1;
      return { x: ox + (boardLeft + x - ox) * s, y: oy + (cam + BH + dy * cos - oy) * s, s };
    },
  };

  const flags = useMemo(() => {
    let f = g.played!.flags;
    for (const s of round.spots) if (done[s.id]) f = walkBeats(s.beats, done[s.id], f).flags;
    return f;
  }, [done, g.played, round.spots]);

  const nearSpot = !walking && !open ? layout.placed.find((p) => !done[p.spot.id] && canTalk(p, me)) : undefined;

  /** 沿格子一步一步走过去 */
  const walk = async (to: Cell, then?: () => void) => {
    if (open) return;
    const path = findPath(me, to, layout.blocked, ROWS);
    if (!path) return;
    const id = ++walkId.current;
    setMoved(true);
    setTarget(to);
    if (!path.length) {
      setTarget(null);
      return then?.();
    }
    sfx.tap();
    setWalking(true);
    let at = me;
    for (const step of path) {
      if (walkId.current !== id) return;
      if (step.c !== at.c) setFacing(step.c < at.c ? 'left' : 'right');
      const up = step.r < at.r;
      const down = step.r > at.r;
      setBack((b) => (up ? true : down ? false : b));
      await Promise.all([animate(mx, step.c, { duration: STEP, ease: 'linear' }), animate(my, step.r, { duration: STEP, ease: 'linear' })]);
      at = step;
      setMe(step);
    }
    if (walkId.current !== id) return;
    setWalking(false);
    setTarget(null);
    then?.();
  };

  const talkTo = (p: Placed) => {
    if (done[p.spot.id] || open) return;
    const begin = () => {
      // 转过去面对 NPC
      setBack(p.npc.r < Math.round(my.get()));
      if (p.npc.c !== Math.round(mx.get())) setFacing(p.npc.c < mx.get() ? 'left' : 'right');
      setTimeout(() => setOpen(p.spot.id), 200);
    };
    if (canTalk(p, me)) return begin();
    void walk(p.talk, begin);
  };

  /** NPC 在屏幕上的位置（给飞道具、手势提示用），相对地图框的百分比 */
  const screenOf = (id: string) => {
    const el = box.current?.querySelector(`[data-npc="${id}"]`);
    const b = box.current?.getBoundingClientRect();
    if (!el || !b) return { x: 50, y: 40 };
    const r = el.getBoundingClientRect();
    return { x: ((r.left + r.width / 2 - b.left) / b.width) * 100, y: ((r.top + r.height * 0.15 - b.top) / b.height) * 100 };
  };
  const [hintAt, setHintAt] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const first = layout.placed[0];
    if (!first) return;
    const t = setTimeout(() => setHintAt(screenOf(first.spot.id)), 300);
    return () => clearTimeout(t);
  }, [layout, size.w, size.h]); // eslint-disable-line react-hooks/exhaustive-deps

  const finishChat = (p: Placed, replies: Replies) => {
    sfx.fix();
    setDone((d) => ({ ...d, [p.spot.id]: replies }));
    setOpen(null);
    const gift = p.spot.gift;
    if (!gift) return;
    const after = walkBeats(p.spot.beats, replies, flags).flags;
    if (!matches(gift.if, after)) return;
    // 道具：NPC 先说一句，道具从他头顶冒出来，飞进背包
    const delta = giftDelta(gift, g.played!.cart);
    setTimeout(() => {
      setSay({ id: p.spot.id, text: gift.say || t('giftSay') });
      sfx.sparkle();
      setFlying({ id: p.spot.id, emoji: gift.emoji, label: gift.label, delta, from: screenOf(p.spot.id) });
    }, 350);
    setTimeout(() => {
      sfx.coin();
      setBag((b) => [...b, { id: p.spot.id, emoji: gift.emoji, label: gift.label, delta }]);
      setFlying(null);
    }, 2300);
    setTimeout(() => setSay(null), 3200);
  };

  const saved = bag.reduce((s, b) => s + b.delta, 0);
  const charW = T * 1.2;
  const charH = charW * (200 / 120);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-1.5 flex items-center gap-2">
        <Emoji e={round.emoji} size={28} loop />
        <h2 className="text-xl font-black text-slate-700">{round.title}</h2>
      </div>

      <div
        ref={box}
        className="relative flex-1 select-none overflow-hidden rounded-[28px] border-2 border-b-[6px] shadow-inner"
        style={{ background: theme.outside, borderColor: theme.edge, perspective: `${persp}px`, perspectiveOrigin: '50% 10%' }}
      >
        {/* 地面层：地砖、光、影子、可点的格子都是平的，单独一层先画。
            Safari / 微信内置浏览器按整块的中心远近排前后，地面和人放在同一个 3D 层里，站在后排的人腿会被地面盖住 */}
        <motion.div
          className="absolute"
          style={{ left: boardLeft, top: camTop, width: BW, height: BH, transformOrigin: '50% 100%', rotateX: TILT }}
        >
          {/* 围栏外的边（草坪 / 墙脚），再铺地砖 */}
          <div className="absolute" style={{ left: -T * 0.45, top: -T * 0.45, width: BW + T * 0.9, height: BH + T * 0.6, background: theme.edge, borderRadius: T * 0.3 }} />
          <div className="absolute inset-0" style={{ backgroundImage: theme.floor, backgroundSize: theme.floorSize(T), borderRadius: T * 0.12, transform: 'translateZ(0.2px)' }} />
          {/* 光：左上亮，四周压暗 */}
          <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(120% 90% at 20% 0%, rgba(255,250,230,.55), rgba(255,250,230,0) 60%), radial-gradient(100% 100% at 50% 50%, rgba(0,0,0,0) 60%, rgba(0,0,0,.18))', transform: 'translateZ(0.3px)' }} />

          {/* 影子 */}
          {layout.decor.map((d, i) => (
            <Shadow key={`d${i}`} x={d.c * T} y={(d.r + 1) * T} w={T} T={T} />
          ))}
          {layout.placed.map((p) => (
            <Fragment key={p.spot.id}>
              <Shadow x={p.c * T} y={(p.r + 1) * T} w={p.w * T} T={T} />
              {!p.behind && <Shadow x={(p.npc.c + 0.5) * T - charW / 2 + charW * 0.1} y={(p.npc.r + 1) * T} w={charW * 0.8} T={T * 0.6} />}
            </Fragment>
          ))}

          {/* 点地面走路：每一格都是一个可点的格子 */}
          {Array.from({ length: ROWS * COLS }, (_, i) => {
            const c = i % COLS;
            const r = Math.floor(i / COLS);
            const free = !layout.blocked.has(key(c, r));
            return (
              <div
                key={i}
                className="absolute"
                style={{ left: c * T, top: r * T, width: T, height: T, transform: 'translateZ(0.4px)' }}
                onClick={() => free && void walk({ c, r })}
              />
            );
          })}
          {/* 目的地光圈 */}
          {target && (
            <motion.div
              key={key(target.c, target.r)}
              className="pointer-events-none absolute rounded-full border-4 border-amber-400"
              style={{ left: target.c * T + T * 0.15, top: target.r * T + T * 0.15, width: T * 0.7, height: T * 0.7, transform: 'translateZ(0.6px)' }}
              initial={{ scale: 1.6, opacity: 0 }}
              animate={{ scale: [1, 0.8, 1], opacity: 1 }}
              transition={{ scale: { repeat: Infinity, duration: 0.8 } }}
            />
          )}

        </motion.div>

        {/* 立着的东西（道具、人、墙）：2D 图层叠在地面层上面，按脚底远近排前后；层本身不挡点击 */}
        <div className="pointer-events-none absolute inset-0" style={{ isolation: 'isolate' }}>
          {/* 后墙（室内）或后排树篱（室外） */}
          <Stand view={view} x={-T * 0.45} y={0} w={BW + T * 0.9} h={theme.wall ? T * 1.7 : T * 0.9} z={-1}>
            {theme.wall ? (
              <div className="relative h-full w-full rounded-t-xl border-[3px] border-b-0 border-[#3A2A26]" style={{ background: theme.wall }}>
                <div className="absolute inset-x-0 bottom-0 h-[14%] bg-black/15" />
                {[0.12, 0.62].map((x) => (
                  <div key={x} className="absolute top-[18%] h-[46%] w-[26%] rounded-md border-[3px] border-[#3A2A26] bg-sky-200" style={{ left: `${x * 100}%` }}>
                    <div className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 bg-[#3A2A26]" />
                    <div className="absolute left-[12%] top-[10%] h-[70%] w-[12%] rotate-12 rounded bg-white/60" />
                  </div>
                ))}
                <div className="absolute left-[44%] top-[22%] h-[32%] w-[12%] rounded border-[3px] border-[#3A2A26] bg-amber-200" />
              </div>
            ) : (
              <div className="relative h-full w-full">
                <div className="absolute inset-x-0 bottom-0 h-[70%] rounded-t-[18px] border-[3px] border-[#3A2A26] bg-[#5DAE45]" />
                <div className="absolute inset-x-0 bottom-[42%] h-[28%] rounded-t-[18px] bg-[#7CC85A]" />
                {Array.from({ length: COLS + 1 }, (_, i) => (
                  <div key={i} className="absolute bottom-0 h-full w-[5%] rounded-t-md border-2 border-[#2B2B2B] bg-[#3F4B5C]" style={{ left: `${(i / COLS) * 92 + 1}%` }} />
                ))}
                <div className="absolute inset-x-0 top-[22%] h-[10%] bg-[#3F4B5C]" />
              </div>
            )}
          </Stand>

          {/* 点缀 */}
          {layout.decor.map((d, i) => {
            const s = PROP_SIZE[d.kind];
            return (
              <Fragment key={i}>
                <Stand view={view} x={d.c * T} y={(d.r + 0.95) * T} w={T} h={s.h * T}>
                  <PropArt kind={d.kind} />
                </Stand>
              </Fragment>
            );
          })}

          {/* 各个地点：道具 + NPC */}
          {layout.placed.map((p) => {
            const s = PROP_SIZE[p.kind];
            const isDone = !!done[p.spot.id];
            const near = nearSpot === p;
            const npcX = (p.npc.c + 0.5) * T - charW / 2;
            // 站在柜台后面的人往后站一点，让柜台挡住下半身
            const npcY = p.behind ? (p.npc.r + 0.55) * T : (p.npc.r + 0.92) * T;
            const npcFacing = mx.get() < p.npc.c ? 'left' : 'right';
            const sign = (
              <div className="mb-[-6px] flex items-center gap-1 whitespace-nowrap rounded-lg border-2 border-[#3A2A26] bg-white px-1.5 text-[11px] font-black leading-5 text-slate-700 shadow">
                <Emoji e={p.spot.emoji} size={14} /> {p.spot.label}
              </div>
            );
            return (
              <Fragment key={p.spot.id}>
                <Stand
                  view={view}
                  x={p.c * T}
                  y={(p.r + 0.97) * T}
                  w={p.w * T}
                  h={s.h * T}
                  top={p.behind ? 0 : T * 0.42}
                  onClick={() => talkTo(p)}
                  // 招牌：一般挂在道具上方；人站在后面的（柜台、小摊、书桌）就钉在正面板上，免得挡住脸
                  above={p.behind ? undefined : sign}
                  // 招牌挂在离 NPC 远的那一头，不被他头顶的气泡挡住
                  align={p.w < 2 ? 'center' : p.npc.c === p.c ? 'end' : 'start'}
                >
                  <PropArt kind={p.kind} />
                  {p.behind && <div className="absolute inset-x-0 bottom-[12%] flex justify-center">{sign}</div>}
                </Stand>
                {/* 盒子放宽到 4 格，给头顶的话留地方；只有人和气泡能点，空白处点了照样走路 */}
                <Stand
                  view={view}
                  x={npcX + charW / 2 - T * 2}
                  y={npcY}
                  w={T * 4}
                  h={charH}
                  top={T * 0.8}
                  data={p.spot.id}
                  above={
                    <AnimatePresence>
                      {say?.id === p.spot.id ? (
                        <Bubble key="say" wrap>
                          {say.text}
                        </Bubble>
                      ) : near ? (
                        <motion.button
                          key="talk"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            talkTo(p);
                          }}
                          className="pointer-events-auto"
                        >
                          <Bubble tone="green">💬 {t('talkTo')}</Bubble>
                        </motion.button>
                      ) : !isDone ? (
                        <Bubble key="bang">
                          ❗{p.spot.gift && <span className="text-xs">🎁</span>}
                        </Bubble>
                      ) : null}
                    </AnimatePresence>
                  }
                >
                  <div className="pointer-events-auto absolute bottom-0 left-1/2 -translate-x-1/2 cursor-pointer" onClick={() => talkTo(p)}>
                    <Character id={p.spot.who} size={charW} act={near ? 'wave' : 'idle'} mood={isDone || near ? 'happy' : 'neutral'} facing={npcFacing} talking={say?.id === p.spot.id} />
                  </div>
                </Stand>
              </Fragment>
            );
          })}

          {/* 玩家 */}
          <Walker view={view} mx={mx} my={my} T={T} w={charW} h={charH}>
            <div className="absolute bottom-[-4%] left-1/2 h-[10%] w-[80%] -translate-x-1/2 rounded-[50%] bg-black/20" />
            <motion.div className="absolute bottom-[-6%] left-1/2 h-[12%] w-[95%] -translate-x-1/2 rounded-[50%] border-[3px] border-yellow-300" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.4 }} />
            <Character id="me" size={charW} act={walking ? 'walk' : allDone ? 'jump' : 'idle'} facing={facing} back={back} mood={allDone ? 'happy' : 'neutral'} />
          </Walker>
        </div>

        {/* 背包：拿到的道具都在这，显示一共省了多少 */}
        <div className="absolute right-2 top-2 z-[260] flex items-center gap-1 rounded-2xl border-2 border-b-4 border-amber-500 bg-amber-50 px-2 py-1 shadow-lg" data-bag>
          <motion.span key={bag.length} initial={{ scale: 1.6 }} animate={{ scale: 1 }} className="text-xl">
            🎒
          </motion.span>
          {bag.map((b) => (
            <Emoji key={b.id} e={b.emoji} size={20} />
          ))}
          {saved !== 0 && <span className={`text-xs font-black ${saved < 0 ? 'text-green-600' : 'text-rose-500'}`}>{saved < 0 ? `-${money(-saved)}` : `+${money(saved)}`}</span>}
        </div>

        {/* 道具：先在 NPC 头顶亮相，再飞进背包 */}
        <AnimatePresence>
          {flying && (
            <motion.div
              key={flying.id}
              className="pointer-events-none absolute z-[270] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              initial={{ left: `${flying.from.x}%`, top: `${flying.from.y}%`, scale: 0, rotate: -20 }}
              animate={{
                left: [`${flying.from.x}%`, `${flying.from.x}%`, `${flying.from.x}%`, '88%'],
                top: [`${flying.from.y}%`, `${Math.max(18, flying.from.y - 14)}%`, `${Math.max(18, flying.from.y - 14)}%`, '4%'],
                scale: [0, 1.25, 1.1, 0.3],
                rotate: [-20, 0, 0, 10],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.9, times: [0, 0.25, 0.7, 1], ease: 'easeInOut' }}
            >
              <div className="absolute -inset-6 animate-spin rounded-full bg-[conic-gradient(from_0deg,rgba(255,220,100,.0),rgba(255,220,100,.7),rgba(255,220,100,0),rgba(255,220,100,.7),rgba(255,220,100,0))] [animation-duration:3s]" />
              <div className="relative flex flex-col items-center rounded-2xl border-2 border-b-4 border-amber-500 bg-white px-3 py-2 shadow-xl">
                <Emoji e={flying.emoji} size={46} />
                <span className="mt-1 whitespace-nowrap text-sm font-black text-slate-700">{flying.label}</span>
                {flying.delta !== 0 && <span className={`text-base font-black ${flying.delta < 0 ? 'text-green-600' : 'text-rose-500'}`}>{flying.delta < 0 ? `-${money(-flying.delta)}` : `+${money(flying.delta)}`}</span>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!moved && hintAt && <HandHint show mode="tap" from={{ x: 50, y: 92 }} to={hintAt} label={t('tapToGo')} />}
      </div>

      {/* 人多的地图不用全聊完：聊过 3 个就能走，剩下的可以跳过 */}
      <Btn className="mt-3" disabled={!(allDone || enough) || !!flying} onClick={() => g.talk(round, done)}>
        {allDone ? t('allAsked') : enough ? t('mapEnough', { n: left }) : t('missing', { n: left })}
      </Btn>

      <AnimatePresence>
        {spot && (
          // 点错了人可以退出来：点外面或点 ✕；聊了一半的不算，这个人还在原地等着
          <motion.div className="fixed inset-0 z-[300] flex items-end bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(null)}>
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 240, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="mx-auto flex h-[86%] w-full max-w-md flex-col rounded-t-[28px] bg-white px-4 pb-5 pt-3"
            >
              <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-200" />
              <div className="mb-1 flex items-center gap-2 text-sm font-black text-slate-400">
                <Emoji e={spot.emoji} size={22} /> <span className="flex-1">{spot.label}</span>
                <button onClick={() => setOpen(null)} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-500" aria-label={t('mapLeave')}>
                  ✕ {t('mapLeave')}
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <Dialogue beats={spot.beats} style="chat" partner={spot.who} baseFlags={flags} onDone={(r) => finishChat(layout.placed.find((p) => p.spot.id === spot.id)!, r)} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
