import { animate, AnimatePresence, motion } from 'framer-motion';
import { Character } from '../chars/Character';
import { GUIDE } from '../chars/library';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { sfx } from '../fx/fx';
import { yuan } from '../lesson/output';
import { Emoji } from './Emoji';

type Tone = 'green' | 'blue' | 'red' | 'amber' | 'white';

const TONES: Record<Tone, string> = {
  green: 'bg-green-500 border-green-700 text-white',
  blue: 'bg-sky-500 border-sky-700 text-white',
  red: 'bg-rose-500 border-rose-700 text-white',
  amber: 'bg-amber-400 border-amber-600 text-amber-950',
  white: 'bg-white border-slate-300 text-slate-600',
};

/** 带「按下去」手感的厚按钮 */
export function Btn({
  children,
  tone = 'green',
  onClick,
  disabled,
  className = '',
}: {
  children: ReactNode;
  tone?: Tone;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      disabled={disabled}
      onClick={() => {
        sfx.tap();
        onClick?.();
      }}
      className={`w-full rounded-2xl border-b-4 px-5 py-3.5 text-lg font-black tracking-wide transition-all active:translate-y-1 active:border-b-0 disabled:translate-y-0 disabled:border-b-4 disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-400 ${TONES[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

/** 大图卡片选项 */
export function Tile({
  emoji,
  label,
  selected,
  onClick,
  size = 72,
  badge,
}: {
  emoji: string;
  label: string;
  selected?: boolean;
  onClick?: () => void;
  size?: number;
  badge?: ReactNode;
}) {
  const [replay, setReplay] = useState(0);
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      animate={selected ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      onClick={() => {
        sfx.tap();
        setReplay((r) => r + 1);
        onClick?.();
      }}
      className={`relative flex flex-col items-center gap-1 rounded-3xl border-2 border-b-[5px] bg-white p-3 transition-colors ${
        selected ? 'border-sky-400 bg-sky-50' : 'border-slate-200 hover:bg-slate-50'
      }`}
    >
      <Emoji e={emoji} size={size} replay={replay} />
      <span className={`text-base font-extrabold ${selected ? 'text-sky-600' : 'text-slate-700'}`}>{label}</span>
      {badge && <span className="absolute -right-1.5 -top-1.5">{badge}</span>}
    </motion.button>
  );
}

export function PriceBadge({ delta }: { delta: number }) {
  if (!delta) return null;
  const down = delta < 0;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-black text-white shadow ${down ? 'bg-green-500' : 'bg-rose-500'}`}>
      {down ? '-' : '+'}
      {yuan(Math.abs(delta))}
    </span>
  );
}

export type Mood = 'idle' | 'happy' | 'worried' | 'shock' | 'party';

/** 吉祥物：一只狐狸 + 情绪气泡 */
export function Mascot({ mood = 'idle', size = 96, say }: { mood?: Mood; size?: number; say?: string }) {
  const face = { idle: 'neutral', happy: 'happy', worried: 'worried', shock: 'surprised', party: 'happy' } as const;
  const act = mood === 'party' ? 'party' : mood === 'happy' ? 'jump' : 'idle';
  const [talking, setTalking] = useState(!!say);
  useEffect(() => {
    if (!say) return;
    setTalking(true);
    const timer = setTimeout(() => setTalking(false), 500 + [...say].length * 110);
    return () => clearTimeout(timer);
  }, [say]);
  return (
    <div className="relative flex items-end gap-2">
      <Character id={GUIDE} size={size} mood={face[mood]} act={act} talking={talking} />
      <AnimatePresence mode="wait">
        {say && (
          <motion.div
            key={say}
            initial={{ opacity: 0, scale: 0.8, x: -8 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            className="relative mb-16 rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-base font-extrabold text-slate-700"
          >
            {say}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function useCountUp(value: number) {
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const c = animate(prev.current, value, { duration: 0.7, ease: 'easeOut', onUpdate: setShown });
    prev.current = value;
    return () => c.stop();
  }, [value]);
  return shown;
}

/** 顶栏：退出、进度条、护盾心、方案总价 */
export function TopBar({
  progress,
  hearts,
  total,
  budget,
  streak,
  onClose,
}: {
  progress: number;
  hearts: number;
  total: number;
  budget: number | null;
  streak: number;
  onClose: () => void;
}) {
  const shown = useCountUp(total);
  const [pop, setPop] = useState<{ d: number; k: number } | null>(null);
  const last = useRef(total);
  useEffect(() => {
    const d = total - last.current;
    last.current = total;
    if (d) setPop({ d, k: Date.now() });
  }, [total]);
  const over = budget !== null && total > budget;

  return (
    <div className="flex items-center gap-3 px-4 pt-4">
      <button onClick={onClose} className="text-2xl font-black text-slate-400 hover:text-slate-600" aria-label="close">
        ✕
      </button>
      <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-slate-200">
        <motion.div
          className="h-full rounded-full bg-green-500"
          animate={{ width: `${Math.max(4, progress * 100)}%` }}
          transition={{ type: 'spring', stiffness: 90, damping: 16 }}
        />
        <div className="absolute left-2 right-2 top-1 h-1 rounded-full bg-white/30" />
      </div>
      {streak >= 3 && (
        <motion.span key={`streak-${streak}`} initial={{ scale: 1.6 }} animate={{ scale: 1 }} className="flex items-center text-sm font-black text-orange-500">
          🔥{streak}
        </motion.span>
      )}
      <motion.span key={`hearts-${hearts}`} initial={{ scale: 1.5 }} animate={{ scale: 1 }} className="flex items-center gap-0.5 text-lg font-black text-rose-500">
        <Emoji e={hearts ? '❤️' : '💔'} size={26} replay={hearts + 1} />
        {hearts}
      </motion.span>
      <div className="relative">
        <span className={`rounded-xl border-2 border-b-4 px-2 py-1 text-sm font-black tabular-nums ${over ? 'border-rose-300 bg-rose-50 text-rose-600' : 'border-amber-300 bg-amber-50 text-amber-700'}`}>
          {yuan(shown)}
        </span>
        <AnimatePresence>
          {pop && (
            <motion.span
              key={pop.k}
              initial={{ opacity: 1, y: 0 }}
              animate={{ opacity: 0, y: 26 }}
              transition={{ duration: 1.2 }}
              onAnimationComplete={() => setPop(null)}
              className="absolute right-0 top-8 whitespace-nowrap"
            >
              <PriceBadge delta={pop.d} />
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
