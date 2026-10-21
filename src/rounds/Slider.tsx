import { motion } from 'framer-motion';
import { useState } from 'react';
import { useGame } from '../game';
import { yuan } from '../lesson/output';
import type { SliderRound } from '../lesson/schema';
import { Emoji } from '../ui/Emoji';
import { Btn } from '../ui/kit';

const snap = (v: number, r: SliderRound) => Math.min(r.max, Math.max(r.min, Math.round((v - r.min) / r.step) * r.step + r.min));

/** 拖动数值；图标随数值变大，预算模式下实时对比当前方案总价 */
export function Slider({ round }: { round: SliderRound }) {
  const g = useGame();
  const total = g.played!.total;
  const isBudget = round.kind === 'budget';
  const [v, setV] = useState(() => snap(round.value ?? (isBudget ? total : (round.min + round.max) / 2), round));
  const t = (v - round.min) / (round.max - round.min);
  const short = isBudget && v < total;
  const marker = Math.min(1, Math.max(0, (total - round.min) / (round.max - round.min)));

  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-2 text-center text-[28px] font-black text-slate-700">{round.q}</h2>
      <div className="flex flex-1 flex-col items-center justify-center">
        <motion.div animate={{ scale: 0.6 + t * 0.9, rotate: short ? [0, -4, 4, 0] : 0 }} transition={{ type: 'spring', stiffness: 200, damping: 12 }}>
          <Emoji e={round.emoji} size={120} loop />
        </motion.div>
        <div className={`mt-6 text-5xl font-black tabular-nums ${short ? 'text-rose-500' : 'text-slate-700'}`}>
          {isBudget ? yuan(v) : `${v}${round.unit}`}
        </div>
        {isBudget && (
          <div className={`mt-1 text-base font-extrabold ${short ? 'text-rose-500' : 'text-green-600'}`}>
            {short ? `比方案少 ${yuan(total - v)}` : '够用 👍'}
          </div>
        )}
      </div>
      <div className="relative mb-8 mt-4 px-1">
        {isBudget && (
          <div className="absolute -top-7 -translate-x-1/2 text-center" style={{ left: `${marker * 100}%` }}>
            <div className="whitespace-nowrap rounded-lg bg-amber-100 px-1.5 text-xs font-black text-amber-700">方案 {yuan(total)}</div>
            <div className="mx-auto h-3 w-0.5 bg-amber-400" />
          </div>
        )}
        <input
          type="range"
          min={round.min}
          max={round.max}
          step={round.step}
          value={v}
          onChange={(e) => setV(Number(e.target.value))}
          className="chunky-range w-full"
          style={{ ['--p' as string]: `${t * 100}%` }}
        />
      </div>
      <Btn onClick={() => g.setValue(round, v)}>确定</Btn>
    </div>
  );
}
