import { motion, type TargetAndTransition } from 'framer-motion';
import type { CSSProperties } from 'react';
import { Emoji } from './Emoji';

/**
 * 场景背景：房间 / 院子 / 办公室 / 街上，以及「一天」里随时间变化的天空。
 * 全部用渐变和 SVG 画，带左上角来的光、地面透视和暗角，和地图关一个风格。
 */

export type SceneKind = 'room' | 'yard' | 'office' | 'street';
export type TimeOfDay = 'morning' | 'noon' | 'evening' | 'night';

const SKY: Record<TimeOfDay, string> = {
  morning: 'linear-gradient(180deg,#ffd6a5 0%,#ffe9c7 35%,#bfe3ff 100%)',
  noon: 'linear-gradient(180deg,#5ab8ff 0%,#9ad7ff 55%,#e3f5ff 100%)',
  evening: 'linear-gradient(180deg,#5b3a8c 0%,#e0607e 45%,#ffb36b 100%)',
  night: 'linear-gradient(180deg,#0b1437 0%,#1d2b5c 60%,#33407a 100%)',
};

/** 光从左上照下来，四周压暗 */
function Light({ warm = true }: { warm?: boolean }) {
  return (
    <>
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(100% 70% at 12% -5%, ${warm ? 'rgba(255,238,200,.75)' : 'rgba(220,235,255,.55)'}, rgba(255,255,255,0) 60%)` }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(95% 85% at 45% 40%, rgba(0,0,0,0) 55%, rgba(20,20,40,.28) 100%)' }} />
    </>
  );
}

export function Backdrop({ kind }: { kind: SceneKind }) {
  if (kind === 'room')
    return (
      <>
        {/* 墙纸 + 地板（透视木纹） */}
        <div className="absolute inset-x-0 top-0 h-[52%]" style={{ background: 'repeating-linear-gradient(90deg,#f6e6cf 0 18px,#f1dcc0 18px 36px)' }} />
        <div className="absolute inset-x-0 top-[52%] h-2 bg-[#b98a5e] shadow-[0_3px_4px_rgba(60,30,10,.35)]" />
        <svg className="absolute inset-x-0 bottom-0 h-[48%] w-full" viewBox="0 0 100 48" preserveAspectRatio="none">
          <defs>
            <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#c99566" />
              <stop offset="1" stopColor="#9c6a43" />
            </linearGradient>
          </defs>
          <rect width="100" height="48" fill="url(#floor)" />
          {[-60, -35, -15, 0, 15, 35, 60, 90, 120, 150].map((x) => (
            <line key={x} x1={50 + (x - 50) * 0.35} y1="0" x2={x} y2="48" stroke="#7d5232" strokeOpacity=".35" strokeWidth=".35" />
          ))}
          {[6, 14, 25, 40].map((y) => (
            <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#7d5232" strokeOpacity=".2" strokeWidth=".3" />
          ))}
        </svg>
        {/* 窗户和落在地板上的阳光 */}
        <div className="absolute left-[8%] top-[10%] h-[30%] w-[26%] rounded-md border-[5px] border-white bg-gradient-to-b from-sky-300 to-sky-100 shadow-[3px_6px_10px_rgba(0,0,0,.25)]">
          <div className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 bg-white" />
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 bg-white" />
        </div>
        <motion.div
          className="pointer-events-none absolute left-[6%] top-[38%] h-[60%] w-[46%] mix-blend-soft-light"
          style={{ clipPath: 'polygon(8% 0,62% 0,100% 100%,30% 100%)', background: 'linear-gradient(180deg,rgba(255,250,220,.95),rgba(255,250,220,.2))' }}
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ repeat: Infinity, duration: 6, ease: 'easeInOut' }}
        />
        <Light />
      </>
    );
  if (kind === 'office')
    return (
      <>
        <div className="absolute inset-x-0 top-0 h-[55%] bg-gradient-to-b from-slate-200 to-slate-300" />
        <div className="absolute left-[6%] right-[6%] top-[7%] grid h-[38%] grid-cols-3 gap-1 rounded-md bg-slate-500 p-1 shadow-[3px_6px_10px_rgba(0,0,0,.25)]">
          {[0, 1, 2].map((i) => (
            <div key={i} className="relative overflow-hidden bg-gradient-to-b from-sky-300 to-sky-100">
              <div className="absolute bottom-0 left-[10%] h-[45%] w-[30%] bg-slate-400/70" />
              <div className="absolute bottom-0 right-[15%] h-[65%] w-[28%] bg-slate-500/60" />
            </div>
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[45%]" style={{ background: 'linear-gradient(180deg,#6b7a99,#4c5875)' }} />
        <div className="absolute inset-x-0 bottom-0 h-[45%] opacity-30" style={{ background: 'repeating-linear-gradient(45deg,transparent 0 6px,rgba(255,255,255,.15) 6px 7px)' }} />
        <Light warm={false} />
      </>
    );
  if (kind === 'street')
    return (
      <>
        <div className="absolute inset-0" style={{ background: SKY.noon }} />
        <div className="absolute inset-x-0 top-[18%] flex h-[34%] items-end gap-1 px-1">
          {[60, 85, 50, 95, 70, 55].map((h, i) => (
            <div key={i} className="flex-1 rounded-t-md shadow-[3px_0_6px_rgba(0,0,0,.2)]" style={{ height: `${h}%`, background: ['#f2c6a0', '#c9d6e8', '#e8b4b8', '#b8d8c8', '#f0dca0', '#d0c4e8'][i] }}>
              <div className="mx-auto mt-2 grid w-3/4 grid-cols-2 gap-1">
                {Array.from({ length: Math.round(h / 20) * 2 }, (_, j) => (
                  <span key={j} className="h-2 rounded-sm bg-white/70" />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="absolute inset-x-0 top-[52%] h-[16%] bg-[#d8d2c4]" style={{ backgroundImage: 'repeating-linear-gradient(90deg,transparent 0 30px,rgba(0,0,0,.08) 30px 32px)' }} />
        <div className="absolute inset-x-0 bottom-0 h-[32%] bg-[#555b66]">
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2" style={{ background: 'repeating-linear-gradient(90deg,#f8f3d0 0 22px,transparent 22px 40px)' }} />
        </div>
        <Light />
      </>
    );
  // yard
  return (
    <>
      <div className="absolute inset-0" style={{ background: SKY.noon }} />
      <svg className="absolute inset-x-0 top-[30%] h-[20%] w-full" viewBox="0 0 100 20" preserveAspectRatio="none">
        <path d="M0 20 Q 15 4 32 12 T 64 8 T 100 12 V20 Z" fill="#9fd38a" />
        <path d="M0 20 Q 25 10 50 16 T 100 14 V20 Z" fill="#7cc16a" />
      </svg>
      <div className="absolute inset-x-0 top-[48%] bottom-0" style={{ background: 'linear-gradient(180deg,#9bd77b,#5fae4a)' }} />
      <div className="absolute inset-x-0 top-[44%] flex h-[8%] justify-around">
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} className="h-full w-2 rounded-t-sm bg-[#f3e2c0] shadow-[2px_2px_2px_rgba(0,0,0,.15)]" />
        ))}
      </div>
      <Light />
    </>
  );
}

/** 「一天」的天空：渐变随时刻过渡，太阳/月亮沿弧线走，夜里有星星 */
export function Sky({ at }: { at: TimeOfDay }) {
  const sun = { morning: { x: 14, y: 42 }, noon: { x: 50, y: 10 }, evening: { x: 86, y: 40 }, night: { x: 78, y: 14 } }[at];
  return (
    <>
      {(Object.keys(SKY) as TimeOfDay[]).map((k) => (
        <motion.div key={k} className="absolute inset-0" style={{ background: SKY[k] }} animate={{ opacity: k === at ? 1 : 0 }} transition={{ duration: 1.2 }} />
      ))}
      <motion.div animate={{ opacity: at === 'night' ? 1 : 0 }} transition={{ duration: 1.2 }} className="absolute inset-0">
        {[8, 22, 35, 48, 63, 71, 88, 15, 57, 92].map((x, i) => (
          <motion.span
            key={i}
            className="absolute h-1 w-1 rounded-full bg-white"
            style={{ left: `${x}%`, top: `${6 + ((i * 37) % 40)}%` }}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ repeat: Infinity, duration: 2 + (i % 3), delay: i * 0.3 }}
          />
        ))}
      </motion.div>
      <motion.div
        className="absolute h-16 w-16 rounded-full"
        animate={{ left: `${sun.x}%`, top: `${sun.y}%` }}
        transition={{ duration: 1.4, ease: 'easeInOut' }}
        style={{
          marginLeft: -32,
          background: at === 'night' ? 'radial-gradient(circle at 35% 35%,#fffbe6,#e8e2c4)' : 'radial-gradient(circle at 40% 40%,#fff7c2,#ffc83d)',
          boxShadow: at === 'night' ? '0 0 30px 8px rgba(255,250,220,.35)' : '0 0 50px 18px rgba(255,210,90,.55)',
        }}
      />
      {/* 地面：随天色变暗 */}
      <motion.div
        className="absolute inset-x-0 bottom-0 h-[36%]"
        animate={{ background: at === 'night' ? 'linear-gradient(180deg,#2c4a3c,#1b2f27)' : at === 'evening' ? 'linear-gradient(180deg,#7c9a5a,#4f6b3a)' : 'linear-gradient(180deg,#9bd77b,#5fae4a)' }}
        transition={{ duration: 1.2 }}
      />
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(95% 85% at 45% 40%, rgba(0,0,0,0) 55%, rgba(10,10,30,.3) 100%)' }} />
    </>
  );
}

/** 场景里的道具和会动的小东西：不挡摆放位置（都在边上），只为让场景「活」起来 */
export function SceneLife({ kind }: { kind: SceneKind }) {
  const prop = (e: string, style: CSSProperties, size = 34, anim?: TargetAndTransition, dur = 3) => (
    <motion.span className="pointer-events-none absolute" style={{ ...style, filter: 'drop-shadow(3px 6px 3px rgba(30,20,10,.3))' }} animate={anim} transition={{ repeat: Infinity, duration: dur, ease: 'easeInOut' }}>
      <Emoji e={e} size={size} />
    </motion.span>
  );
  if (kind === 'room')
    return (
      <>
        <div className="pointer-events-none absolute left-[38%] top-[70%] h-[20%] w-[46%] rounded-[50%]" style={{ background: 'radial-gradient(closest-side, #d9746a 0 60%, #b85a52 61% 70%, #e8a17c 71% 100%)', opacity: 0.75, boxShadow: '0 4px 8px rgba(60,30,10,.25)' }} />
        {prop('🖼️', { left: '44%', top: '12%' }, 34)}
        {prop('🕰️', { right: '8%', top: '10%' }, 30, { rotate: [-3, 3, -3] }, 2)}
        {prop('🪴', { right: '3%', top: '40%' }, 46, { rotate: [-3, 3, -3], originY: 1 }, 4)}
        {prop('💡', { left: '64%', top: '-1%' }, 26, { rotate: [-4, 4, -4], originY: 0 }, 5)}
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.span key={i} className="pointer-events-none absolute h-1 w-1 rounded-full bg-yellow-50" style={{ left: `${14 + i * 6}%` }} animate={{ top: ['72%', '40%'], opacity: [0, 0.9, 0] }} transition={{ repeat: Infinity, duration: 6 + i, delay: i * 1.3 }} />
        ))}
      </>
    );
  if (kind === 'yard')
    return (
      <>
        {[0, 1].map((i) => (
          <motion.div key={i} className="pointer-events-none absolute h-6 w-20 rounded-full bg-white/90 blur-[2px]" style={{ top: `${6 + i * 10}%` }} initial={{ left: i ? '60%' : '-20%' }} animate={{ left: ['-25%', '110%'] }} transition={{ repeat: Infinity, duration: 40 + i * 15, ease: 'linear', delay: i ? -20 : 0 }} />
        ))}
        {prop('🌳', { left: '2%', top: '24%' }, 64, { rotate: [-2, 2, -2], originY: 1 }, 5)}
        {prop('🌳', { right: '4%', top: '20%' }, 52, { rotate: [2, -2, 2], originY: 1 }, 6)}
        <motion.span className="pointer-events-none absolute" animate={{ left: ['-10%', '110%'], top: ['14%', '8%', '16%'] }} transition={{ repeat: Infinity, duration: 9, ease: 'linear', repeatDelay: 6 }}>
          <Emoji e="🐦" size={22} />
        </motion.span>
        <motion.span className="pointer-events-none absolute" animate={{ left: ['70%', '80%', '62%', '74%', '70%'], top: ['80%', '72%', '76%', '84%', '80%'] }} transition={{ repeat: Infinity, duration: 7, ease: 'easeInOut' }}>
          <Emoji e="🦋" size={20} />
        </motion.span>
      </>
    );
  if (kind === 'office')
    return (
      <>
        {prop('🪴', { left: '2%', top: '50%' }, 46, { rotate: [-2, 2, -2], originY: 1 }, 4)}
        {prop('🚰', { right: '3%', top: '46%' }, 40)}
        {[18, 30, 52, 64, 80].map((x, i) => (
          <motion.span key={x} className="pointer-events-none absolute h-1 w-1.5 bg-yellow-200" style={{ left: `${x}%`, top: `${30 + (i % 3) * 3}%` }} animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 2 + i * 0.4 }} />
        ))}
      </>
    );
  // street
  return (
    <>
      {prop('🌳', { left: '1%', top: '30%' }, 54, { rotate: [-2, 2, -2], originY: 1 }, 5)}
      {prop('🏮', { right: '4%', top: '34%' }, 30)}
      <motion.span className="pointer-events-none absolute top-[78%]" animate={{ left: ['-15%', '110%'] }} transition={{ repeat: Infinity, duration: 6, ease: 'linear', repeatDelay: 3 }}>
        <Emoji e="🚗" size={36} />
      </motion.span>
      <motion.span className="pointer-events-none absolute top-[86%] scale-x-[-1]" animate={{ left: ['110%', '-15%'] }} transition={{ repeat: Infinity, duration: 7, ease: 'linear', repeatDelay: 4, delay: 2 }}>
        <Emoji e="🚕" size={36} />
      </motion.span>
    </>
  );
}

/** 「一天」的远景：山、房子（傍晚/夜里亮灯）、树、路灯（天黑亮起）、云、鸟、萤火虫 */
export function DayLife({ at }: { at: TimeOfDay }) {
  const dark = at === 'evening' || at === 'night';
  const night = at === 'night';
  return (
    <>
      {/* 远山两层：颜色随天色变 */}
      <svg className="pointer-events-none absolute inset-x-0 bottom-[30%] h-[26%] w-full" viewBox="0 0 100 26" preserveAspectRatio="none">
        <motion.path d="M0 26 Q 12 6 26 14 T 52 10 T 78 12 T 100 8 V26 Z" animate={{ fill: night ? '#1e2a4a' : at === 'evening' ? '#7a4f7a' : '#a7d3a0' }} transition={{ duration: 1.2 }} />
        <motion.path d="M0 26 Q 20 14 40 20 T 80 16 T 100 20 V26 Z" animate={{ fill: night ? '#253556' : at === 'evening' ? '#8d6a6a' : '#86c47a' }} transition={{ duration: 1.2 }} />
      </svg>
      {/* 山脚的小房子：天黑亮灯 */}
      <div className="pointer-events-none absolute bottom-[33%] left-[8%] flex items-end gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="relative" style={{ width: 26 + i * 4, height: 22 + (i % 2) * 6 }}>
            <div className="absolute inset-x-0 bottom-0 h-[70%] rounded-sm" style={{ background: night ? '#3b3f5c' : '#f3e1c7' }} />
            <div className="absolute inset-x-[-3px] top-0 h-[40%]" style={{ background: night ? '#5a2f3a' : '#d9534f', clipPath: 'polygon(50% 0,100% 100%,0 100%)' }} />
            <motion.div className="absolute bottom-[18%] left-[30%] h-[28%] w-[40%] rounded-[2px]" animate={{ background: dark ? '#ffd76a' : '#9fc6e8', boxShadow: dark ? '0 0 8px 2px rgba(255,215,106,.8)' : 'none' }} transition={{ duration: 1, delay: i * 0.2 }} />
          </div>
        ))}
      </div>
      <motion.span className="pointer-events-none absolute bottom-[30%] right-[10%]" style={{ filter: 'drop-shadow(3px 6px 3px rgba(0,0,0,.3))', originY: 1 }} animate={{ rotate: [-2, 2, -2] }} transition={{ repeat: Infinity, duration: 5 }}>
        <Emoji e="🌳" size={64} />
      </motion.span>
      {/* 路灯：天黑亮起，地上一圈暖光 */}
      <div className="pointer-events-none absolute bottom-[22%] right-[30%] h-[34%] w-1.5 rounded bg-slate-600" />
      <motion.div className="pointer-events-none absolute right-[calc(30%-7px)] top-[40%] h-4 w-5 rounded-t-full" animate={{ background: dark ? '#ffe9a8' : '#cbd5e1', boxShadow: dark ? '0 0 26px 14px rgba(255,220,130,.55)' : 'none' }} transition={{ duration: 1 }} />
      <motion.div className="pointer-events-none absolute bottom-[16%] right-[22%] h-6 w-24 rounded-[50%]" animate={{ opacity: dark ? 0.7 : 0 }} style={{ background: 'radial-gradient(closest-side, rgba(255,220,130,.8), rgba(255,220,130,0))' }} />
      {/* 白天的云和早上的鸟 */}
      {!dark &&
        [0, 1].map((i) => (
          <motion.div key={i} className="pointer-events-none absolute h-6 w-20 rounded-full bg-white/90 blur-[2px]" style={{ top: `${10 + i * 12}%` }} initial={{ left: i ? '55%' : '5%' }} animate={{ left: ['-25%', '110%'] }} transition={{ repeat: Infinity, duration: 34 + i * 12, ease: 'linear', delay: i ? -14 : -4 }} />
        ))}
      {at === 'morning' && (
        <motion.span className="pointer-events-none absolute" animate={{ left: ['-8%', '108%'], top: ['22%', '14%', '20%'] }} transition={{ repeat: Infinity, duration: 7, ease: 'linear', repeatDelay: 2 }}>
          <Emoji e="🐦" size={22} />
        </motion.span>
      )}
      {/* 夜里的萤火虫 */}
      {night &&
        [15, 32, 58, 72, 88].map((x, i) => (
          <motion.span key={x} className="pointer-events-none absolute h-1.5 w-1.5 rounded-full bg-lime-200 shadow-[0_0_8px_3px_rgba(217,249,157,.8)]" style={{ left: `${x}%` }} animate={{ top: [`${62 + (i % 3) * 5}%`, `${55 + (i % 2) * 6}%`, `${62 + (i % 3) * 5}%`], opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 3 + i * 0.6 }} />
        ))}
      {/* 小路 */}
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-[22%] w-[60%] -translate-x-1/2" style={{ background: dark ? 'linear-gradient(180deg,#5b5248,#4a423a)' : 'linear-gradient(180deg,#e9d3a6,#d8bb85)', clipPath: 'polygon(40% 0,60% 0,100% 100%,0 100%)', opacity: 0.8 }} />
    </>
  );
}
