import { AnimatePresence, motion, type TargetAndTransition } from 'framer-motion';
import { useEffect, useId, useState } from 'react';
import { artFor, type Art, type Pose, type Rig } from './art';
import { charById, MOODS, type Accessory, type Look, type Mood } from './library';

/**
 * 矢量角色骨架：头、双臂、双腿都是独立的可动部件。
 * 支持眨眼、说话口型、表情、手势、挥手、跳、走路。
 */

export { MOODS, type Mood };
export type Act = 'idle' | 'walk' | 'wave' | 'jump' | 'party';

const INK = '#3A2A26';
const MOUTH = '#7A2E2E';

function useBlink() {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => {
        setClosed(true);
        setTimeout(() => setClosed(false), 130);
        loop();
      }, 1800 + Math.random() * 3200);
    };
    loop();
    return () => clearTimeout(t);
  }, []);
  return closed;
}

/** 说话时嘴巴不规则地开合，比固定节奏更像真人 */
function useMouthFlap(talking: boolean) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!talking) return setOpen(false);
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => {
        setOpen((o) => !o);
        loop();
      }, 80 + Math.random() * 110);
    };
    loop();
    return () => clearTimeout(t);
  }, [talking]);
  return open;
}

// ---------------- 脸 ----------------

function Eyes({ mood, closed, look }: { mood: Mood; closed: boolean; look: number }) {
  if (mood === 'happy' || mood === 'smug') {
    // 笑眼：弯弯的
    return (
      <g stroke={INK} strokeWidth={2.6} strokeLinecap="round" fill="none">
        <path d={mood === 'smug' ? 'M-16,2 L-8,2' : 'M-16,3 Q-12,-3 -8,3'} />
        <path d="M8,3 Q12,-3 16,3" />
      </g>
    );
  }
  const big = mood === 'surprised' ? 1.25 : 1;
  return (
    <g>
      {[-12, 12].map((x) => (
        <motion.g key={x} animate={{ scaleY: closed ? 0.12 : 1 }} transition={{ duration: 0.06 }} style={{ originX: 0.5, originY: 0.5 }}>
          <ellipse cx={x + look} cy={2} rx={3.8 * big} ry={4.8 * big} fill={INK} />
          <circle cx={x + look + 1.3} cy={0.2} r={1.3} fill="#fff" />
        </motion.g>
      ))}
    </g>
  );
}

const BROW: Record<Mood, { y: number; a: number }> = {
  neutral: { y: -11, a: 0 },
  happy: { y: -13, a: -4 },
  sad: { y: -11, a: -14 },
  angry: { y: -9, a: 18 },
  surprised: { y: -16, a: 0 },
  worried: { y: -12, a: -12 },
  smug: { y: -12, a: 6 },
  thinking: { y: -12, a: 8 },
};

function Brows({ mood, color }: { mood: Mood; color: string }) {
  const b = BROW[mood];
  return (
    <g fill={color}>
      <motion.rect x={-17} y={-1.6} width={10} height={3.2} rx={1.6} animate={{ y: b.y, rotate: b.a }} style={{ originX: 0.5, originY: 0.5 }} />
      <motion.rect x={7} y={-1.6} width={10} height={3.2} rx={1.6} animate={{ y: b.y, rotate: mood === 'thinking' ? -14 : -b.a }} style={{ originX: 0.5, originY: 0.5 }} />
    </g>
  );
}

function Mouth({ mood, open }: { mood: Mood; open: boolean }) {
  if (open)
    return (
      <g transform="translate(0,21)">
        <ellipse rx={6} ry={4.6} fill={MOUTH} />
        <ellipse cy={2.2} rx={3.6} ry={1.8} fill="#F28B8B" />
      </g>
    );
  const s = { stroke: INK, strokeWidth: 2.4, strokeLinecap: 'round' as const, fill: 'none' };
  switch (mood) {
    case 'happy':
      return (
        <g transform="translate(0,18)">
          <path d="M-10,-1 Q0,15 10,-1 Z" fill={MOUTH} />
          <path d="M-8.5,0 L8.5,0 L7.5,3 L-7.5,3 Z" fill="#fff" />
        </g>
      );
    case 'sad':
      return <path d="M-7,24 Q0,17 7,24" {...s} />;
    case 'angry':
      return <path d="M-7,23 Q0,19 7,23" {...s} strokeWidth={2.8} />;
    case 'surprised':
      return <ellipse cy={21} rx={4} ry={5} fill={MOUTH} />;
    case 'worried':
      return <path d="M-7,22 Q-3.5,19 0,22 Q3.5,25 7,22" {...s} />;
    case 'smug':
      return <path d="M-6,21 Q3,26 9,18" {...s} />;
    case 'thinking':
      return <path d="M-4,22 L5,21" {...s} />;
    default:
      return <path d="M-7,19 Q0,25 7,19" {...s} />;
  }
}

// ---------------- 头发与配饰 ----------------

function HairBack({ look }: { look: Look }) {
  const c = look.hair.color;
  switch (look.hair.style) {
    case 'long':
      return <path d="M-38,-10 C-40,-44 40,-44 38,-10 L40,40 Q0,52 -40,40 Z" fill={c} />;
    case 'bob':
      return <path d="M-37,-6 C-40,-44 40,-44 37,-6 L38,22 Q32,30 24,24 L-24,24 Q-32,30 -38,22 Z" fill={c} />;
    case 'bun':
      return <circle cx={0} cy={-44} r={13} fill={c} />;
    default:
      return null;
  }
}

function HairFront({ look }: { look: Look }) {
  const c = look.hair.color;
  switch (look.hair.style) {
    case 'short':
      return <path d="M-35,-4 C-36,-30 -20,-44 0,-44 C20,-44 36,-30 35,-4 C30,-16 22,-24 8,-26 C-6,-22 -24,-22 -35,-4 Z" fill={c} />;
    case 'curly':
      return (
        <g fill={c}>
          <path d="M-35,-2 C-36,-30 -18,-40 0,-40 C18,-40 36,-30 35,-2 C28,-18 14,-24 0,-24 C-14,-24 -28,-18 -35,-2 Z" />
          {[[-31, -14, 10], [-24, -29, 12], [-8, -39, 13], [10, -39, 13], [25, -29, 12], [32, -13, 10]].map(([x, y, r]) => (
            <circle key={x} cx={x} cy={y} r={r} />
          ))}
        </g>
      );
    case 'bun':
      return <path d="M-35,-2 C-35,-32 -18,-42 0,-42 C18,-42 35,-32 35,-2 C26,-22 14,-28 0,-28 C-14,-28 -26,-22 -35,-2 Z" fill={c} />;
    case 'bob':
    case 'long':
      return <path d="M-35,-4 C-35,-38 35,-38 35,-4 C22,-20 -8,-26 -35,-4 Z" fill={c} />;
    case 'spiky':
      return <path d="M-36,-2 L-38,-26 L-26,-30 L-24,-46 L-10,-36 L0,-52 L10,-36 L24,-46 L26,-30 L38,-26 L36,-2 C28,-18 16,-24 0,-24 C-16,-24 -28,-18 -36,-2 Z" fill={c} />;
    case 'slick':
      return (
        <g>
          <path d="M-35,-4 C-36,-34 -14,-44 4,-44 C24,-44 36,-32 35,-4 C34,-20 28,-28 14,-30 L-6,-24 C-20,-22 -30,-16 -35,-4 Z" fill={c} />
          <path d="M-6,-38 C6,-42 18,-38 24,-30" stroke="#fff" strokeOpacity={0.35} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        </g>
      );
    case 'bald':
      return (
        <g fill={c}>
          <path d="M-35,6 Q-37,-8 -30,-16 Q-30,-4 -33,6 Z" />
          <path d="M35,6 Q37,-8 30,-16 Q30,-4 33,6 Z" />
        </g>
      );
  }
}

function FaceAcc({ acc, look }: { acc: Accessory[]; look: Look }) {
  const has = (a: Accessory) => acc.includes(a);
  return (
    <g>
      {has('freckles') && (
        <g fill="#C97B5A" opacity={0.6}>
          {[[-22, 12], [-18, 15], [-24, 16], [22, 12], [18, 15], [24, 16]].map(([x, y]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r={1.1} />
          ))}
        </g>
      )}
      {has('wrinkles') && (
        <g stroke={INK} strokeOpacity={0.35} strokeWidth={1.2} fill="none" strokeLinecap="round">
          <path d="M-22,-2 L-19,0 M-22,4 L-19,3" />
          <path d="M22,-2 L19,0 M22,4 L19,3" />
          <path d="M-10,-22 Q0,-24 10,-22" />
        </g>
      )}
      {has('glasses') && (
        <g stroke="#333" strokeWidth={2} fill="#fff" fillOpacity={0.25}>
          <circle cx={-12} cy={2} r={8} />
          <circle cx={12} cy={2} r={8} />
          <path d="M-4,1 Q0,-1 4,1" fill="none" />
        </g>
      )}
      {has('squareGlasses') && (
        <g stroke="#222" strokeWidth={2.4} fill="#fff" fillOpacity={0.2}>
          <rect x={-21} y={-5} width={17} height={13} rx={3} />
          <rect x={4} y={-5} width={17} height={13} rx={3} />
          <path d="M-4,0 L4,0" />
        </g>
      )}
      {has('mustache') && <path d="M-11,15 Q-5,10 0,13 Q5,10 11,15 Q5,18 0,16 Q-5,18 -11,15 Z" fill={look.hair.color === '#8A8A8A' ? '#6E6E6E' : look.hair.color} />}
      {has('beard') && <path d="M-30,6 Q-28,34 0,38 Q28,34 30,6 Q24,24 0,26 Q-24,24 -30,6 Z" fill={look.hair.color} />}
      {has('earrings') && (
        <g fill="#F5B700">
          <circle cx={-34} cy={14} r={2.5} />
          <circle cx={34} cy={14} r={2.5} />
        </g>
      )}
    </g>
  );
}

function HeadWear({ acc, look }: { acc: Accessory[]; look: Look }) {
  return (
    <g>
      {acc.includes('headset') && (
        <g>
          <path d="M-37,0 C-38,-54 38,-54 37,0" stroke="#2B2D42" strokeWidth={4.5} fill="none" />
          <rect x={-42} y={-6} width={10} height={16} rx={4} fill="#2B2D42" />
          <rect x={32} y={-6} width={10} height={16} rx={4} fill="#2B2D42" />
          <path d="M-38,8 Q-34,24 -16,24" stroke="#2B2D42" strokeWidth={2} fill="none" />
        </g>
      )}
      {acc.includes('strawHat') && (
        <g>
          <ellipse cx={0} cy={-28} rx={52} ry={10} fill="#E9C46A" />
          <path d="M-25,-28 C-25,-60 25,-60 25,-28 Z" fill="#F4D58D" />
          <rect x={-25} y={-37} width={50} height={6} fill="#C0392B" />
        </g>
      )}
      {acc.includes('hardHat') && (
        <g>
          <path d="M-36,-16 C-36,-58 36,-58 36,-16 Z" fill="#FFD23F" />
          <rect x={-43} y={-19} width={86} height={7} rx={3.5} fill="#F4B400" />
          <rect x={-4} y={-52} width={8} height={36} rx={3} fill="#F4B400" />
        </g>
      )}
      {acc.includes('cap') && (
        <g>
          <path d="M-35,-14 C-35,-52 35,-52 35,-14 Z" fill={look.hatColor ?? '#E63946'} />
          <path d="M10,-16 Q40,-20 52,-12 Q40,-8 10,-12 Z" fill={look.hatColor ?? '#B91C1C'} style={{ filter: 'brightness(.8)' }} />
        </g>
      )}
      {acc.includes('headscarf') && (
        <g>
          {/* 包头的头巾：盖住头顶，在脑后打个结 */}
          <path d="M-37,-10 C-38,-50 38,-50 37,-10 C20,-20 -20,-20 -37,-10 Z" fill={look.hatColor ?? '#D9824A'} />
          <path d="M-37,-10 C-20,-18 20,-18 37,-10" stroke="#00000022" strokeWidth={3} fill="none" />
          <circle cx={-34} cy={-30} r={2.2} fill="#FFFFFF88" />
          <circle cx={-14} cy={-40} r={2.2} fill="#FFFFFF88" />
          <circle cx={10} cy={-41} r={2.2} fill="#FFFFFF88" />
        </g>
      )}
    </g>
  );
}

// ---------------- 身体 ----------------

function Torso({ look, clip }: { look: Look; clip: string }) {
  const body = 'M36,106 Q36,96 48,96 L72,96 Q84,96 84,106 L87,150 Q87,158 79,158 L41,158 Q33,158 33,150 Z';
  const o = look.outfit;
  return (
    <g>
      <defs>
        <clipPath id={clip}>
          <path d={body} />
        </clipPath>
      </defs>
      {o === 'hoodie' && <ellipse cx={60} cy={97} rx={19} ry={7} fill={look.accent} />}
      <path d={body} fill={look.top} />
      <g clipPath={`url(#${clip})`}>
        {o === 'plaid' && (
          <g stroke={look.accent} strokeWidth={3} opacity={0.55}>
            {[42, 54, 66, 78].map((x) => <line key={x} x1={x} y1={90} x2={x} y2={160} />)}
            {[110, 124, 138, 152].map((y) => <line key={y} x1={30} y1={y} x2={90} y2={y} />)}
          </g>
        )}
        {o === 'cardigan' && <rect x={53} y={94} width={14} height={66} fill={look.accent} />}
        {o === 'vest' && (
          <g>
            <path d="M33,96 L52,96 L56,160 L33,160 Z M68,96 L87,96 L87,160 L64,160 Z" fill={look.accent} />
            <rect x={30} y={128} width={60} height={4} fill="#E5E7EB" />
            <rect x={30} y={142} width={60} height={4} fill="#E5E7EB" />
          </g>
        )}
        {o === 'hoodie' && (
          <g>
            <rect x={45} y={132} width={30} height={15} rx={6} fill={look.accent} opacity={0.6} />
            <path d="M55,100 L54,116 M65,100 L66,116" stroke={look.accent} strokeWidth={2} strokeLinecap="round" />
          </g>
        )}
      </g>
      {(o === 'tee' || o === 'hoodie' || o === 'plaid' || o === 'cardigan' || o === 'vest') && <path d="M52,96 Q60,104 68,96 Z" fill={look.skin} />}
      {o === 'shirt' && (
        <g>
          <path d="M50,95 L60,108 L53,95 Z M70,95 L60,108 L67,95 Z" fill={look.accent} />
          {[116, 128, 140].map((y) => <circle key={y} cx={60} cy={y} r={1.6} fill={look.accent} />)}
        </g>
      )}
      {o === 'suit' && (
        <g>
          <path d="M50,96 L60,124 L70,96 Z" fill="#F8FAFC" />
          <path d="M58,99 L62,99 L64.5,119 L60,125 L55.5,119 Z" fill={look.accent} />
          <path d="M48,96 L58,124 L46,110 Z M72,96 L62,124 L74,110 Z" fill="#000" opacity={0.15} />
        </g>
      )}
      {o === 'cardigan' && [112, 126, 140].map((y) => <circle key={y} cx={51} cy={y} r={1.8} fill="#fff" opacity={0.8} />)}
    </g>
  );
}

function Arm({ look, x, side, anim }: { look: Look; x: number; side: -1 | 1; anim: TargetAndTransition }) {
  return (
    <g transform={`translate(${x},104)`}>
      <motion.g animate={anim} style={{ originX: 0.5, originY: 0 }} initial={{ rotate: side * -8 }}>
        <rect x={-6.5} y={-2} width={13} height={40} rx={6.5} fill={look.top} />
        <circle cx={0} cy={42} r={6.8} fill={look.skin} />
      </motion.g>
    </g>
  );
}

function Leg({ look, x, anim }: { look: Look; x: number; anim: TargetAndTransition }) {
  return (
    <g transform={`translate(${x},152)`}>
      <motion.g animate={anim} style={{ originX: 0.5, originY: 0 }}>
        <rect x={-7} y={0} width={14} height={34} rx={7} fill={look.bottom} />
        <ellipse cx={2} cy={36} rx={10} ry={6} fill="#2D2D2D" />
      </motion.g>
    </g>
  );
}

// ---------------- 手绘角色 ----------------

/** 说话时在「当前表情」和「张嘴」两张图之间切，节奏比矢量的嘴慢一点，像手绘动画 */
function useTalkFrame(talking: boolean) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!talking) return setOpen(false);
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => {
        setOpen((o) => !o);
        loop();
      }, 140 + Math.random() * 160);
    };
    loop();
    return () => clearTimeout(t);
  }, [talking]);
  return open;
}

function poseOf(act: Act, mood: Mood, pose?: Pose): Pose {
  if (pose) return pose;
  if (act === 'walk') return 'walk';
  if (act === 'wave') return 'greet';
  if (act === 'party') return 'cheer';
  if (mood === 'thinking') return 'think';
  if (mood === 'worried' || mood === 'sad') return 'worry';
  if (mood === 'angry') return 'angry';
  return 'idle';
}

/** 说话时手势轮换（打招呼 → 指点 → 站好），像边说边比划 */
const TALK_GESTURES: Pose[] = ['greet', 'idle', 'point', 'idle'];
function useGesture(on: boolean, art: Art) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!on) return setI(0);
    const t = setInterval(() => setI((n) => n + 1), 1300 + Math.random() * 500);
    return () => clearInterval(t);
  }, [on]);
  if (!on) return null;
  const list = TALK_GESTURES.filter((p) => p === 'idle' || art.has(p));
  return list[i % list.length];
}

/** 每个姿势自己的小循环：挥手摇摆、思考晃头、欢呼蹦跳、担心发抖… */
function loopOf(p: Pose, h: number, talking: boolean, mood: Mood): TargetAndTransition {
  switch (p) {
    case 'greet':
      return { rotate: [0, 4, -2, 4, 0], transition: { repeat: Infinity, duration: 0.9 } };
    case 'point':
      return { rotate: [0, 3, 0], x: [0, 2, 0], transition: { repeat: Infinity, duration: 1.2 } };
    case 'think':
      return { rotate: [-2.5, 2.5, -2.5], transition: { repeat: Infinity, duration: 2.4, ease: 'easeInOut' } };
    case 'cheer':
      return { y: [0, -h * 0.1, 0, 0], scaleY: [1, 1.04, 0.93, 1], transition: { repeat: Infinity, duration: 0.75, times: [0, 0.4, 0.75, 1] } };
    case 'worry':
      return { x: [0, -1.5, 1.5, -1, 0], transition: { repeat: Infinity, duration: 0.5, repeatDelay: 0.8 } };
    case 'angry':
      return { x: [0, -2, 2, -2, 0], scaleY: [1, 1.03, 1], transition: { repeat: Infinity, duration: 0.35, repeatDelay: 0.6 } };
    case 'sit':
      return { scaleY: [1, 1.01, 1], transition: { repeat: Infinity, duration: 3 } };
    default:
      return talking
        ? { rotate: [-1.5, 1.5, -1.5], y: [0, -1.5, 0], transition: { repeat: Infinity, duration: 0.9 } }
        : mood === 'happy'
          ? { y: [0, -h * 0.025, 0], transition: { repeat: Infinity, duration: 0.8 } }
          : { scaleY: [1, 1.015, 1], rotate: [0, 0.6, 0], transition: { repeat: Infinity, duration: 2.8, ease: 'easeInOut' } };
  }
}

/** 一张全身像拆成「上半身 + 左腿 + 右腿」三层，腿绕胯部交替摆，上半身随步子上下颠 */
function Puppet({ src, rig, speed = 0.46 }: { src: string; rig: Rig; speed?: number }) {
  const hip = rig.hip * 100;
  const split = rig.split * 100;
  const img = 'pointer-events-none absolute inset-0 h-full w-full select-none';
  const swing = (dir: 1 | -1): TargetAndTransition => ({ rotate: [8 * dir, -8 * dir, 8 * dir], transition: { repeat: Infinity, duration: speed, ease: 'easeInOut' } });
  return (
    <span className="absolute inset-0 block">
      <motion.img src={src} alt="" draggable={false} className={img} style={{ clipPath: `polygon(0 ${hip - 2}%, ${split}% ${hip - 2}%, ${split}% 100%, 0 100%)`, transformOrigin: `${split}% ${hip}%` }} animate={swing(1)} />
      <motion.img src={src} alt="" draggable={false} className={img} style={{ clipPath: `polygon(${split}% ${hip - 2}%, 100% ${hip - 2}%, 100% 100%, ${split}% 100%)`, transformOrigin: `${split}% ${hip}%` }} animate={swing(-1)} />
      <motion.img
        src={src}
        alt=""
        draggable={false}
        className={img}
        style={{ clipPath: `polygon(0 0, 100% 0, 100% ${hip + 4}%, 0 ${hip + 4}%)`, transformOrigin: `${split}% ${hip}%` }}
        animate={{ y: ['0%', '-2.2%', '0%'], rotate: [-1.5, 1.5, -1.5], transition: { repeat: Infinity, duration: speed / 2, ease: 'easeInOut' } }}
      />
    </span>
  );
}

/** 头顶的表情气泡（RPG 里的 ❗💭💦） */
function Emote({ e }: { e?: string }) {
  return (
    <AnimatePresence>
      {e && (
        <motion.span
          key={e}
          initial={{ opacity: 0, scale: 0.3, y: 6 }}
          animate={{ opacity: 1, scale: [0.3, 1.2, 1], y: 0 }}
          exit={{ opacity: 0, scale: 0.5 }}
          transition={{ duration: 0.35 }}
          className="absolute -top-[2%] left-[62%] z-10 flex h-8 w-8 items-center justify-center rounded-full rounded-bl-none border-2 border-slate-200 bg-white text-lg shadow-md"
        >
          {e}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function ArtCharacter({ art, name, size, mood, talking, act, facing, bust, pose, emote }: { art: Art; name: string; size: number; mood: Mood; talking: boolean; act: Act; facing: 'left' | 'right'; bust: boolean; pose?: Pose; emote?: string }) {
  const open = useTalkFrame(talking);
  const gesture = useGesture(talking && !bust && !pose && act === 'idle', art);
  if (bust) {
    const h = size * (108 / 96);
    return (
      <span className="relative block overflow-hidden rounded-[22%] bg-white ring-2 ring-white" style={{ width: size, height: h }} aria-label={name}>
        {/* 两张都叠着放，只切换透明度：换表情不闪 */}
        <img src={art.face(mood)} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover object-top" style={{ opacity: open ? 0 : 1 }} />
        {talking && <img src={art.face('talk')} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover object-top" style={{ opacity: open ? 1 : 0 }} />}
      </span>
    );
  }
  const p = gesture ?? poseOf(act, mood, pose);
  const h = size * (200 / 120);
  const walking = p === 'walk';
  // 全身像宽高比约 0.35；放进 0.6 的格子里，图按高度撑满、水平居中
  return (
    <span className="relative block" style={{ width: size, height: h }} aria-label={name}>
      <motion.span
        className="absolute bottom-[1%] left-1/2 h-[5%] w-[70%] -translate-x-1/2 rounded-[50%] bg-black/15"
        animate={walking ? { scaleX: [1, 0.85, 1], transition: { repeat: Infinity, duration: 0.23 } } : p === 'cheer' ? { scaleX: [1, 0.6, 1, 1], transition: { repeat: Infinity, duration: 0.75, times: [0, 0.4, 0.75, 1] } } : { scaleX: 1 }}
      />
      {walking && <Dust facing={facing} />}
      <span className="absolute bottom-[3%] left-1/2 block h-[97%] -translate-x-1/2" style={{ aspectRatio: String(art.rig.ratio) }}>
        <AnimatePresence initial={false}>
          <motion.span
            key={walking ? 'walk' : p}
            className="absolute inset-0 block"
            style={{ originY: 1 }}
            // 换动作：先压扁再弹起，像动画里的预备动作
            initial={{ opacity: 0, scaleY: 0.9, scaleX: 1.06 }}
            animate={{ opacity: 1, scaleY: 1, scaleX: 1, transition: { type: 'spring', stiffness: 500, damping: 14 } }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
          >
            <motion.span
              className="absolute inset-0 block"
              style={{ originY: 1 }}
              animate={walking ? { rotate: facing === 'right' ? 3 : -3 } : loopOf(p, h, talking, mood)}
            >
              {walking ? (
                <Puppet src={art.pose('idle')} rig={art.rig} />
              ) : (
                <img src={art.pose(p)} alt="" draggable={false} className="pointer-events-none absolute bottom-0 left-1/2 h-full w-auto max-w-none -translate-x-1/2 select-none" />
              )}
            </motion.span>
          </motion.span>
        </AnimatePresence>
      </span>
      <Emote e={emote} />
    </span>
  );
}

/** 走路时脚后跟扬起的小土团 */
function Dust({ facing }: { facing: 'left' | 'right' }) {
  const back = facing === 'right' ? -1 : 1;
  return (
    <>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="pointer-events-none absolute bottom-[2%] left-1/2 h-2 w-2 rounded-full bg-amber-100/80"
          animate={{ x: [0, back * (10 + i * 4)], y: [0, -6 - i * 2], opacity: [0.9, 0], scale: [0.6, 1.4] }}
          transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.2, ease: 'easeOut' }}
        />
      ))}
    </>
  );
}

// ---------------- 角色 ----------------

export function Character({
  id,
  size = 120,
  mood = 'neutral',
  talking = false,
  act = 'idle',
  facing = 'right',
  bust = false,
  gaze = 0,
  pose,
  vector = false,
  emote,
}: {
  id: string;
  /** 宽度（像素） */
  size?: number;
  mood?: Mood;
  talking?: boolean;
  act?: Act;
  facing?: 'left' | 'right';
  /** 只画头和肩（对话头像） */
  bust?: boolean;
  /** 眼睛往左(-)/右(+)看 */
  gaze?: number;
  /** 手绘角色：直接指定全身姿势（不指定就按 act / mood 选） */
  pose?: Pose;
  /** 强制用矢量小人 */
  vector?: boolean;
  /** 头顶冒的表情气泡（只有手绘角色有） */
  emote?: string;
}) {
  const def = charById(id);
  const art = vector ? null : artFor(def?.id);
  if (def && art) return <ArtCharacter art={art} name={def.name.en} size={size} mood={mood} talking={talking} act={act} facing={facing} bust={bust} pose={pose} emote={emote} />;
  return <VectorCharacter id={id} size={size} mood={mood} talking={talking} act={act} facing={facing} bust={bust} gaze={gaze} />;
}

function VectorCharacter({ id, size, mood, talking, act, facing, bust, gaze }: { id: string; size: number; mood: Mood; talking: boolean; act: Act; facing: 'left' | 'right'; bust: boolean; gaze: number }) {
  const def = charById(id);
  const closed = useBlink();
  const open = useMouthFlap(talking);
  const clip = useId().replace(/:/g, '');
  if (!def) return null;
  const look = def.look;
  const scale = look.scale ?? 1;

  const walk = act === 'walk';
  const cycle = { repeat: Infinity, duration: 0.5, ease: 'easeInOut' as const };
  const legL: TargetAndTransition = walk ? { rotate: [24, -24, 24], transition: cycle } : { rotate: 0 };
  const legR: TargetAndTransition = walk ? { rotate: [-24, 24, -24], transition: cycle } : { rotate: 0 };

  let armL: TargetAndTransition = { rotate: [8, 11, 8], transition: { repeat: Infinity, duration: 2.6 } };
  let armR: TargetAndTransition = { rotate: [-8, -11, -8], transition: { repeat: Infinity, duration: 2.6 } };
  if (walk) {
    armL = { rotate: [-22, 22, -22], transition: cycle };
    armR = { rotate: [22, -22, 22], transition: cycle };
  } else if (act === 'wave') {
    armR = { rotate: [-150, -120, -150], transition: { repeat: Infinity, duration: 0.45 } };
  } else if (act === 'party') {
    armL = { rotate: [150, 165, 150], transition: { repeat: Infinity, duration: 0.4 } };
    armR = { rotate: [-150, -165, -150], transition: { repeat: Infinity, duration: 0.4 } };
  } else if (talking) {
    armR = { rotate: [-10, -48, -30, -10], transition: { repeat: Infinity, duration: 1.8 } };
  } else if (mood === 'angry') {
    armL = { rotate: 30 };
    armR = { rotate: -30 };
  } else if (mood === 'thinking') {
    armR = { rotate: 140 };
  } else if (mood === 'surprised') {
    armL = { rotate: 50 };
    armR = { rotate: -50 };
  }

  const body: TargetAndTransition =
    act === 'jump' || act === 'party'
      ? { y: [0, -16, 0], transition: { repeat: Infinity, duration: 0.6, ease: 'easeOut' } }
      : walk
        ? { y: [0, -3, 0], transition: { repeat: Infinity, duration: 0.25 } }
        : mood === 'happy'
          ? { y: [0, -5, 0], transition: { repeat: Infinity, duration: 0.7 } }
          : mood === 'angry'
            ? { x: [0, -1.5, 1.5, 0], transition: { repeat: Infinity, duration: 0.3 } }
            : { y: [0, -1.2, 0], transition: { repeat: Infinity, duration: 2.6 } };

  const head: TargetAndTransition =
    mood === 'sad' ? { rotate: 6, y: 2 } :
    mood === 'worried' ? { rotate: [-4, 4, -4], transition: { repeat: Infinity, duration: 1.6 } } :
    mood === 'thinking' ? { rotate: -8 } :
    talking ? { rotate: [-3, 3, -3], transition: { repeat: Infinity, duration: 1.2 } } :
    { rotate: 0 };

  const look2 = gaze * 2.2;
  const vb = bust ? '12 6 96 108' : '0 0 120 200';
  const h = bust ? size * (108 / 96) : size * (200 / 120);

  return (
    <svg viewBox={vb} width={size} height={h} className={bust ? "" : "overflow-visible"} aria-label={def.name.en}>
      <g transform={`translate(60,${200 * (1 - scale)}) scale(${scale}) translate(-60,0)`}>
        {!bust && (
          <motion.ellipse
            cx={60}
            cy={192}
            rx={26}
            ry={5}
            fill="#000"
            opacity={0.12}
            animate={act === 'jump' || act === 'party' ? { scaleX: [1, 0.7, 1], transition: { repeat: Infinity, duration: 0.6 } } : { scaleX: 1 }}
          />
        )}
        <g transform={facing === 'left' ? 'translate(120,0) scale(-1,1)' : undefined}>
          <motion.g animate={body}>
            <Leg look={look} x={50} anim={legL} />
            <Leg look={look} x={70} anim={legR} />
            <Torso look={look} clip={clip} />
            <Arm look={look} x={35} side={-1} anim={armL} />
            <Arm look={look} x={85} side={1} anim={armR} />
            <rect x={53} y={84} width={14} height={14} fill={look.skin} />
            <g transform="translate(60,56)">
              <motion.g animate={head} style={{ originX: 0.5, originY: 1 }}>
                <HairBack look={look} />
                <circle cx={-34} cy={4} r={7} fill={look.skin} />
                <circle cx={34} cy={4} r={7} fill={look.skin} />
                <ellipse cx={0} cy={0} rx={34} ry={36} fill={look.skin} />
                <ellipse cx={-21} cy={13} rx={6} ry={3.6} fill="#FF7A8A" opacity={0.35} />
                <ellipse cx={21} cy={13} rx={6} ry={3.6} fill="#FF7A8A" opacity={0.35} />
                <Eyes mood={mood} closed={closed} look={look2} />
                <Brows mood={mood} color={look.hair.style === 'bald' ? '#6E6E6E' : look.hair.color} />
                <path d="M-2,8 Q0,12 3,9" stroke={INK} strokeOpacity={0.45} strokeWidth={2} fill="none" strokeLinecap="round" />
                <Mouth mood={mood} open={open} />
                <FaceAcc acc={look.acc} look={look} />
                <HairFront look={look} />
                <HeadWear acc={look.acc} look={look} />
              </motion.g>
            </g>
          </motion.g>
        </g>
      </g>
    </svg>
  );
}
