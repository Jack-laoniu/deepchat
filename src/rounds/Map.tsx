import { animate, AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Character, type Act } from '../chars/Character';
import { sfx } from '../fx/fx';
import { useGame } from '../game';
import { t } from '../i18n';
import { walkBeats, type Replies } from '../lesson/engine';
import type { MapRound } from '../lesson/schema';
import { Emoji } from '../ui/Emoji';
import { Btn } from '../ui/kit';
import { HandHint } from '../ui/Hint';
import { Dialogue, useCast } from './Talk';

type Pt = { x: number; y: number };
const DECOR = [
  { e: '🌳', x: 7, y: 12 }, { e: '🌲', x: 92, y: 16 }, { e: '🌼', x: 28, y: 90 }, { e: '🌳', x: 72, y: 93 },
  { e: '🪨', x: 52, y: 7 }, { e: '🌷', x: 5, y: 58 }, { e: '🌲', x: 95, y: 66 }, { e: '🌻', x: 40, y: 52 },
];
/** 光从左上来：影子往右下落 */
const SHADOW = 'drop-shadow(3px 6px 3px rgba(20,60,20,.35))';
/** 近大远小：越靠下（越近）越大 */
const depth = (y: number) => 0.8 + (y / 100) * 0.4;

/** 地图底：有光照、云影、草地纹理和暗角，看起来有立体感 */
function Ground({ spots }: { spots: MapRound['spots'] }) {
  return (
    <>
      {/* 远处偏亮偏冷，近处偏深偏暖 */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,#e7f9c4 0%,#b9e88a 30%,#86cf63 65%,#5fb04a 100%)' }} />
      <svg className="absolute inset-0 h-full w-full opacity-60" preserveAspectRatio="none">
        <defs>
          <pattern id="grass" width="22" height="18" patternUnits="userSpaceOnUse">
            <path d="M3 14 l2 -5 l2 5 M13 8 l1.5 -4 l1.5 4" stroke="#4d9a3a" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity=".55" />
            <circle cx="18" cy="15" r="1" fill="#f0ffd8" opacity=".7" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grass)" />
      </svg>
      {/* 小路：先画一层影子，再画沙土，再画一道高光 */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {spots.map((s) => {
          const d = `M 50 62 Q ${(50 + s.x) / 2} ${s.y + 26} ${s.x} ${s.y + 14}`;
          return (
            <g key={s.id}>
              <path d={d} transform="translate(0.6 1.2)" fill="none" stroke="#3f7a2e" strokeOpacity=".35" strokeWidth="6" strokeLinecap="round" />
              <path d={d} fill="none" stroke="#e9cf98" strokeWidth="5" strokeLinecap="round" />
              <path d={d} transform="translate(-0.5 -0.6)" fill="none" stroke="#fff7df" strokeOpacity=".8" strokeWidth="1.6" strokeLinecap="round" />
            </g>
          );
        })}
      </svg>
      {/* 阳光：左上角暖光 + 几道光束 */}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(110% 75% at 12% -8%, rgba(255,240,200,.9), rgba(255,240,200,0) 62%)' }} />
      {[18, 38, 60].map((l, i) => (
        <motion.div
          key={l}
          className="pointer-events-none absolute -top-10 h-[140%] w-10 origin-top mix-blend-soft-light"
          style={{ left: `${l}%`, rotate: -28, background: 'linear-gradient(180deg, rgba(255,255,230,.75), rgba(255,255,230,0))' }}
          animate={{ opacity: [0.35, 0.7, 0.35] }}
          transition={{ repeat: Infinity, duration: 5 + i * 1.3, ease: 'easeInOut', delay: i }}
        />
      ))}
      {/* 云影慢慢飘过 */}
      {[0, 1].map((i) => (
        <motion.div
          key={i}
          className="pointer-events-none absolute h-40 w-56 rounded-full bg-emerald-950/15 blur-2xl"
          style={{ top: `${15 + i * 45}%` }}
          initial={{ left: i ? '-60%' : '30%' }}
          animate={{ left: ['-60%', '110%'] }}
          transition={{ repeat: Infinity, duration: 38 + i * 14, ease: 'linear', delay: i ? 0 : -18 }}
        />
      ))}
      {/* 空气里的光点 */}
      {[12, 30, 55, 70, 85].map((x, i) => (
        <motion.span
          key={x}
          className="pointer-events-none absolute h-1.5 w-1.5 rounded-full bg-yellow-50 shadow-[0_0_6px_2px_rgba(255,250,210,.8)]"
          style={{ left: `${x}%` }}
          animate={{ top: ['92%', '8%'], opacity: [0, 1, 0] }}
          transition={{ repeat: Infinity, duration: 9 + i * 1.7, delay: i * 1.9, ease: 'linear' }}
        />
      ))}
      {/* 暗角：边缘和近处压暗，中间更亮 */}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(90% 80% at 45% 40%, rgba(0,0,0,0) 55%, rgba(10,40,10,.28) 100%)' }} />
    </>
  );
}
/** 地图上走一个百分点要多少秒 */
const PACE = 0.045;
/** 离 NPC 多近（百分点）算「走到跟前」 */
const NEAR = 13;
const clampX = (x: number) => Math.min(95, Math.max(5, x));
const clampY = (y: number) => Math.min(96, Math.max(16, y));

/** 会自己溜达的 NPC：在自己的地点附近来回走；玩家走近时转过来打招呼，头上冒「聊聊」 */
function Npc({ id, home, near, done, name, onTap, onMove }: { id: string; home: Pt; near: boolean; done: boolean; name: string; onTap: () => void; onMove: (p: Pt) => void }) {
  // 站在建筑朝地图中间的那一侧，不挡住地点名字
  const side = home.x > 50 ? -13 : 13;
  const [pos, setPos] = useState<Pt>({ x: home.x + side, y: home.y + 10 });
  const [act, setAct] = useState<Act>('idle');
  const [facing, setFacing] = useState<'left' | 'right'>('left');
  const [dur, setDur] = useState(0.3);
  const alive = useRef(true);

  useEffect(() => onMove(pos), [pos]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    alive.current = true;
    if (near) {
      setAct('wave');
      setFacing(pos.x > 50 ? 'left' : 'right');
      return;
    }
    setAct('idle');
    let timer: ReturnType<typeof setTimeout>;
    const wander = () => {
      timer = setTimeout(() => {
        if (!alive.current) return;
        const target = { x: home.x + side + (Math.random() * 8 - 4) * Math.sign(side), y: home.y + 8 + Math.random() * 6 };
        setPos((p) => {
          const d = Math.hypot(target.x - p.x, target.y - p.y);
          setFacing(target.x < p.x ? 'left' : 'right');
          setDur(d * PACE * 1.6);
          setAct('walk');
          setTimeout(() => alive.current && setAct('idle'), d * PACE * 1600);
          return target;
        });
        wander();
      }, 2600 + Math.random() * 3200);
    };
    wander();
    return () => {
      alive.current = false;
      clearTimeout(timer);
    };
  }, [near, home.x, home.y]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.button
      data-npc={id}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onTap}
      className="absolute -translate-x-1/2 -translate-y-full"
      animate={{ left: `${pos.x}%`, top: `${pos.y}%` }}
      transition={{ duration: dur, ease: 'linear' }}
      style={{ zIndex: Math.round(pos.y) }}
    >
      <span className="block" style={{ filter: SHADOW }}>
        <Character id={id} size={Math.round(64 * depth(pos.y))} act={act} facing={facing} mood={done || near ? 'happy' : 'neutral'} />
      </span>
      <AnimatePresence>
        {near && !done && (
          <motion.span
            initial={{ opacity: 0, y: 8, scale: 0.6 }}
            animate={{ opacity: 1, y: [0, -4, 0], scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ y: { repeat: Infinity, duration: 0.9 } }}
            className="absolute -top-9 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-2xl border-2 border-b-4 border-green-600 bg-green-500 px-2.5 py-1 text-sm font-black text-white shadow-lg"
          >
            💬 {t('talkTo', { name })}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

/**
 * 地图关：玩家自己操控小人——点哪走哪，或者按住拖动像摇杆一样一直走。
 * 走到人跟前，那人转过来打招呼、头上冒「聊聊」，点一下开聊；直接点人也会走过去聊。全部聊完才能出发。
 */
export function MapQuest({ round }: { round: MapRound }) {
  const g = useGame();
  const who = useCast();
  const [done, setDone] = useState<Record<string, Replies>>({});
  const mx = useMotionValue(50);
  const my = useMotionValue(88);
  const left = useTransform(mx, (v) => `${v}%`);
  const top = useTransform(my, (v) => `${v}%`);
  const [meY, setMeY] = useState(88);
  const [walking, setWalking] = useState(false);
  const [facing, setFacing] = useState<'left' | 'right'>('right');
  const [moved, setMoved] = useState(false);
  const [near, setNear] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [stick, setStick] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const npcPos = useRef<Record<string, Pt>>({});
  const anims = useRef<{ stop: () => void }[]>([]);
  const arrive = useRef<(() => void) | null>(null);
  const press = useRef<{ x: number; y: number; id: number; drag: boolean } | null>(null);
  const spot = round.spots.find((s) => s.id === open);
  const allDone = round.spots.every((s) => done[s.id]);
  const next = round.spots.find((s) => !done[s.id]);

  const flags = useMemo(() => {
    let f = g.played!.flags;
    for (const s of round.spots) if (done[s.id]) f = walkBeats(s.beats, done[s.id], f).flags;
    return f;
  }, [done, g.played, round.spots]);

  /** 看看离谁最近 */
  const check = () => {
    const me = { x: mx.get(), y: my.get() };
    let best: string | null = null;
    let bd = NEAR;
    for (const s of round.spots) {
      const p = npcPos.current[s.id];
      if (!p || done[s.id]) continue;
      const d = Math.hypot(p.x - me.x, (p.y - me.y) * 0.8);
      if (d < bd) (bd = d), (best = s.id);
    }
    setNear(best);
    setMeY(me.y);
  };

  const stopWalk = () => {
    anims.current.forEach((a) => a.stop());
    anims.current = [];
    arrive.current = null;
  };

  /** 直线走到某点；到了之后可以接着做事（比如开聊） */
  const walkTo = (dest: Pt, then?: () => void) => {
    if (open) return;
    stopWalk();
    const to = { x: clampX(dest.x), y: clampY(dest.y) };
    const dist = Math.hypot(to.x - mx.get(), to.y - my.get());
    setMoved(true);
    if (dist < 0.5) return then?.();
    setFacing(to.x < mx.get() ? 'left' : 'right');
    setWalking(true);
    arrive.current = then ?? null;
    const duration = dist * PACE;
    const ax = animate(mx, to.x, { duration, ease: 'linear', onUpdate: check });
    const ay = animate(my, to.y, {
      duration,
      ease: 'linear',
      onComplete: () => {
        setWalking(false);
        check();
        const f = arrive.current;
        arrive.current = null;
        f?.();
      },
    });
    anims.current = [ax, ay];
  };

  const talk = (id: string) => {
    if (done[id] || open) return;
    const p = npcPos.current[id];
    const s = round.spots.find((x) => x.id === id)!;
    const at = p ?? { x: s.x, y: s.y + 12 };
    // 站到 NPC 朝地图中间的那一侧
    const dest = { x: at.x + (at.x > 50 ? -9 : 9), y: at.y + 1 };
    sfx.whoosh();
    walkTo(dest, () => {
      setFacing(at.x < mx.get() ? 'left' : 'right');
      setTimeout(() => setOpen(id), 250);
    });
  };

  // 摇杆：按住拖动时按方向一直走
  useEffect(() => {
    if (!stick) return;
    let raf = 0;
    let last = performance.now();
    const rect = box.current!.getBoundingClientRect();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const len = Math.hypot(stick.dx, stick.dy);
      if (len > 4) {
        const k = Math.min(1, len / 50);
        // 屏幕上的速度一致：按像素算，再换回百分比
        const speedPx = (k * rect.width) / (100 * PACE);
        mx.set(clampX(mx.get() + ((stick.dx / len) * speedPx * dt * 100) / rect.width));
        my.set(clampY(my.get() + ((stick.dy / len) * speedPx * dt * 100) / rect.height));
        check();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stick]); // eslint-disable-line react-hooks/exhaustive-deps

  const pct = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-2">
        <Emoji e={round.emoji} size={36} loop />
        <h2 className="text-2xl font-black text-slate-700">{round.title}</h2>
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        {round.spots.map((s) => (
          <button key={s.id} onClick={() => talk(s.id)} className={`rounded-full px-2.5 py-1 text-xs font-black ${done[s.id] ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            {done[s.id] ? '✅' : '⬜'} {t('find', { name: who(s.who).as ?? who(s.who).name })}
          </button>
        ))}
      </div>

      {/* overflow: clip 而不是 hidden：飘出边界的云影不能让地图被滚动错位 */}
      <div
        ref={box}
        className="relative flex-1 touch-none select-none overflow-hidden rounded-[28px] border-2 border-b-[6px] border-green-400 shadow-inner"
        style={{ overflow: 'clip' }}
        onPointerDown={(e) => {
          if (open) return;
          press.current = { x: e.clientX, y: e.clientY, id: e.pointerId, drag: false };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const p = press.current;
          if (!p || p.id !== e.pointerId) return;
          const dx = e.clientX - p.x;
          const dy = e.clientY - p.y;
          if (!p.drag && Math.hypot(dx, dy) > 12) {
            p.drag = true;
            stopWalk();
            setMoved(true);
            setWalking(true);
          }
          if (p.drag) {
            const r = box.current!.getBoundingClientRect();
            setStick({ x: ((p.x - r.left) / r.width) * 100, y: ((p.y - r.top) / r.height) * 100, dx, dy });
            if (Math.abs(dx) > 4) setFacing(dx < 0 ? 'left' : 'right');
          }
        }}
        onPointerUp={(e) => {
          const p = press.current;
          press.current = null;
          if (!p) return;
          if (p.drag) {
            setStick(null);
            setWalking(false);
            check();
          } else walkTo(pct(e));
        }}
        onPointerCancel={() => {
          press.current = null;
          setStick(null);
          setWalking(false);
        }}
      >
        <Ground spots={round.spots} />
        {DECOR.map((d, i) => (
          <span key={i} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${d.x}%`, top: `${d.y}%`, filter: SHADOW }}>
            <Emoji e={d.e} size={Math.round(28 * depth(d.y))} />
          </span>
        ))}

        {round.spots.map((s) => (
          <button
            key={s.id}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => talk(s.id)}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${s.x}%`, top: `${s.y}%`, zIndex: 1 }}
          >
            <div className="relative" style={{ transform: `scale(${depth(s.y)})` }}>
              {/* 地台：亮面朝左上，影子落在右下 */}
              <span
                className="absolute left-1/2 top-[70%] h-6 w-[84px] -translate-x-1/2 rounded-[50%]"
                style={{ background: 'radial-gradient(70% 90% at 35% 30%, #f6e7c1, #cdb27a 70%, #a98b52)', boxShadow: '4px 7px 8px rgba(30,60,20,.4)' }}
              />
              <span className="relative block" style={{ filter: SHADOW }}>
                <Emoji e={s.emoji} size={60} />
              </span>
              {!done[s.id] ? (
                <motion.span
                  animate={{ y: [0, -6, 0] }}
                  transition={{ repeat: Infinity, duration: 0.9 }}
                  className="absolute -right-2 -top-3 flex h-7 w-7 items-center justify-center rounded-full border-2 border-b-4 border-amber-500 bg-amber-300 text-base font-black text-amber-900"
                >
                  !
                </motion.span>
              ) : (
                <span className="absolute -right-2 -top-3 text-xl">✅</span>
              )}
            </div>
            <span className="relative mt-1 rounded-full bg-white/95 px-2.5 py-0.5 text-sm font-black text-slate-700 shadow-md">{s.label}</span>
          </button>
        ))}

        {round.spots.map((s) => (
          <Npc
            key={s.id}
            id={s.who}
            home={{ x: s.x, y: s.y }}
            near={near === s.id && !walking && !open}
            done={!!done[s.id]}
            name={who(s.who).as ?? who(s.who).name}
            onTap={() => (near === s.id && !walking ? setOpen(s.id) : talk(s.id))}
            onMove={(p) => {
              npcPos.current[s.id] = p;
            }}
          />
        ))}

        <motion.div className="pointer-events-none absolute -translate-x-1/2 -translate-y-full" style={{ left, top, zIndex: Math.round(meY) + 1 }}>
          <span className="block" style={{ filter: SHADOW }}>
            <Character id="me" size={Math.round(50 * depth(meY))} act={walking ? 'walk' : allDone ? 'jump' : 'idle'} facing={facing} mood={allDone ? 'happy' : 'neutral'} />
          </span>
          {/* 脚下一圈光：一眼认出哪个是自己 */}
          <motion.span
            className="absolute -bottom-1 left-1/2 h-3 w-12 -translate-x-1/2 rounded-[50%] border-2 border-yellow-200/90"
            animate={{ opacity: [0.5, 1, 0.5], scale: [0.9, 1.1, 0.9] }}
            transition={{ repeat: Infinity, duration: 1.4 }}
          />
        </motion.div>

        {/* 摇杆：按下的位置出现一个圈，小圆点跟着手指 */}
        {stick && (
          <div className="pointer-events-none absolute z-[240] h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white/70 bg-white/25" style={{ left: `${stick.x}%`, top: `${stick.y}%` }}>
            <span
              className="absolute left-1/2 top-1/2 h-10 w-10 rounded-full border-2 border-b-4 border-green-600 bg-green-400 shadow-lg"
              style={{ transform: `translate(calc(-50% + ${Math.max(-36, Math.min(36, stick.dx))}px), calc(-50% + ${Math.max(-36, Math.min(36, stick.dy))}px))` }}
            />
          </div>
        )}

        {/* 还没动过：手指示范点地面走路 */}
        <HandHint show={!moved && !open} mode="tap" from={{ x: 50, y: 82 }} to={next ? { x: next.x + (next.x > 50 ? -13 : 13), y: next.y + 6 } : { x: 50, y: 50 }} label={t('tapToGo')} />
        {moved && !allDone && !open && !near && !stick && !walking && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-[200] -translate-x-1/2 whitespace-nowrap rounded-2xl border-2 border-b-4 border-amber-400 bg-amber-50 px-4 py-1.5 text-base font-black text-amber-800 shadow-lg">
            {t('walkNear')}
          </div>
        )}
      </div>

      <Btn className="mt-3" disabled={!allDone} onClick={() => g.talk(round, done)}>
        {allDone ? t('allAsked') : t('missing', { n: round.spots.filter((s) => !done[s.id]).length })}
      </Btn>

      <AnimatePresence>
        {spot && (
          <motion.div className="fixed inset-0 z-[300] flex items-end bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 240, damping: 28 }}
              className="mx-auto flex h-[86%] w-full max-w-md flex-col rounded-t-[28px] bg-white px-4 pb-5 pt-3"
            >
              <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-200" />
              <div className="mb-1 flex items-center gap-2 text-sm font-black text-slate-400">
                <Emoji e={spot.emoji} size={22} /> {spot.label}
              </div>
              <div className="min-h-0 flex-1">
                <Dialogue
                  beats={spot.beats}
                  style="chat"
                  partner={spot.who}
                  baseFlags={flags}
                  onDone={(r) => {
                    sfx.fix();
                    setDone((d) => ({ ...d, [spot.id]: r }));
                    setOpen(null);
                    setNear(null);
                  }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
