import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, type RefObject } from 'react';
import { Emoji } from './Emoji';

/**
 * 操作示范：一只手演示「拖到哪儿」或「点哪儿」，配一行大字。
 * 用户一直没动手时才出现（delay 毫秒后），父组件在用户开始操作后把 show 设为 false。
 * 坐标都是相对父元素的百分比。
 */
export function HandHint({
  show,
  mode,
  from,
  to,
  label,
  labelAt = 'bottom',
  delay = 900,
}: {
  show: boolean;
  mode: 'drag' | 'tap';
  from: { x: number; y: number };
  to?: { x: number; y: number };
  label?: string;
  labelAt?: 'top' | 'bottom';
  delay?: number;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!show) return setReady(false);
    const t = setTimeout(() => setReady(true), delay);
    return () => clearTimeout(t);
  }, [show, delay]);

  const dest = to ?? from;
  const visible = show && ready;
  return (
    <AnimatePresence>
      {visible && (
        <motion.div key="hint" className="pointer-events-none absolute inset-0 z-[250]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          {mode === 'tap' && (
            <motion.span
              className="absolute h-14 w-14 rounded-full border-4 border-white/90"
              style={{ left: `${dest.x}%`, top: `${dest.y}%`, marginLeft: -28, marginTop: -28 }}
              animate={{ scale: [0.4, 1.4], opacity: [0.9, 0] }}
              transition={{ repeat: Infinity, duration: 1.4, ease: 'easeOut', delay: 0.5 }}
            />
          )}
          {mode === 'drag' && (
            // 拖动轨迹：任意方向的虚线（起点到终点）
            <motion.svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" animate={{ opacity: [0, 0.9, 0.9, 0] }} transition={{ repeat: Infinity, duration: 2.2, times: [0, 0.2, 0.8, 1] }}>
              <line x1={from.x} y1={from.y} x2={dest.x} y2={dest.y} stroke="white" strokeOpacity=".85" strokeWidth="1.6" strokeDasharray="3 2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 5 }} />
            </motion.svg>
          )}
          <motion.div
            className="absolute"
            style={{ marginLeft: -8, marginTop: -4, filter: 'drop-shadow(0 6px 6px rgba(0,0,0,.35))' }}
            // 点按模式手指就待在目标上，只做按下的动作；拖动模式从起点拖到终点
            initial={mode === 'tap' ? { left: `${dest.x}%`, top: `${dest.y}%` } : { left: `${from.x}%`, top: `${from.y}%` }}
            animate={
              mode === 'drag'
                ? { left: [`${from.x}%`, `${from.x}%`, `${dest.x}%`, `${dest.x}%`], top: [`${from.y}%`, `${from.y}%`, `${dest.y}%`, `${dest.y}%`], scale: [1, 0.88, 0.88, 1], opacity: [0, 1, 1, 0] }
                : { scale: [1, 0.82, 1], y: [0, 6, 0] }
            }
            transition={mode === 'drag' ? { repeat: Infinity, duration: 2.2, times: [0, 0.2, 0.8, 1], ease: 'easeInOut' } : { repeat: Infinity, duration: 1.4, delay: 0.5 }}
          >
            <Emoji e="👆" size={46} />
          </motion.div>
          {label && (
            // 居中用外层 flex：motion 会接管 transform，不能用 translate 居中
            <div className={`absolute inset-x-0 flex justify-center px-3 ${labelAt === 'bottom' ? 'bottom-3' : 'top-3'}`}>
              <motion.div
                initial={{ y: labelAt === 'bottom' ? 12 : -12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="rounded-2xl border-2 border-b-4 border-amber-400 bg-amber-50 px-4 py-2 text-center text-lg font-black text-amber-800 shadow-lg"
              >
                {label}
              </motion.div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * 算出示范手势的起点和终点（相对 box 的百分比）：直接量「要拖的那个东西」和「要放的地方」在屏幕上的位置，
 * 这样手指总是从真东西出发、落到真位置，不会被裁剪或对不上。
 */
export function useHintPath(box: RefObject<HTMLElement | null>, from: () => HTMLElement | null | undefined, to: () => HTMLElement | null | undefined, deps: unknown[]) {
  const [path, setPath] = useState<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  useEffect(() => {
    const measure = () => {
      const b = box.current?.getBoundingClientRect();
      const f = from()?.getBoundingClientRect();
      const t = to()?.getBoundingClientRect();
      if (!b || !f || !t || !b.width || !b.height) return setPath(null);
      const pct = (r: DOMRect) => ({ x: ((r.left + r.width / 2 - b.left) / b.width) * 100, y: ((r.top + r.height / 2 - b.top) / b.height) * 100 });
      setPath({ from: pct(f), to: pct(t) });
    };
    // 等入场动画放完再量
    const id = setTimeout(measure, 700);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(id);
      window.removeEventListener('resize', measure);
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return path;
}
