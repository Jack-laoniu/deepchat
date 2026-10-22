import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useRef, useState } from 'react';

/**
 * 「爽」的反馈：在某个位置迸出一圈碎片 / 星星，并飘起一行字。
 * 坐标是相对容器左上角的像素；容器需要 position: relative。
 */

type Burst = { id: number; x: number; y: number; colors: string[]; text?: string; textColor?: string; stars: boolean };

const DEFAULT = ['#facc15', '#22c55e', '#38bdf8', '#f472b6', '#fb923c'];

export function useBursts() {
  const [list, setList] = useState<Burst[]>([]);
  const seq = useRef(0);
  const fire = useCallback((x: number, y: number, o: { colors?: string[]; text?: string; textColor?: string; stars?: boolean } = {}) => {
    const id = ++seq.current;
    setList((l) => [...l, { id, x, y, colors: o.colors ?? DEFAULT, text: o.text, textColor: o.textColor, stars: o.stars ?? true }]);
    setTimeout(() => setList((l) => l.filter((b) => b.id !== id)), 1100);
  }, []);

  const layer = (
    <div className="pointer-events-none absolute inset-0 z-[260] overflow-visible">
      <AnimatePresence>
        {list.map((b) => (
          <div key={b.id} className="absolute" style={{ left: b.x, top: b.y }}>
            {Array.from({ length: 12 }, (_, i) => {
              const ang = (i / 12) * Math.PI * 2 + (b.id % 7) * 0.3;
              const dist = 46 + ((i * 17) % 30);
              const star = b.stars && i % 3 === 0;
              return (
                <motion.span
                  key={i}
                  className="absolute block"
                  style={{
                    width: star ? 14 : 9,
                    height: star ? 14 : 9,
                    marginLeft: star ? -7 : -4.5,
                    marginTop: star ? -7 : -4.5,
                    background: b.colors[i % b.colors.length],
                    borderRadius: star ? 0 : 9,
                    clipPath: star ? 'polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)' : undefined,
                  }}
                  initial={{ x: 0, y: 0, scale: 0.4, opacity: 1, rotate: 0 }}
                  animate={{ x: Math.cos(ang) * dist, y: Math.sin(ang) * dist + 26, scale: [0.4, 1.2, 0.6], opacity: [1, 1, 0], rotate: star ? 180 : 0 }}
                  transition={{ duration: 0.75, ease: 'easeOut' }}
                />
              );
            })}
            {b.text && (
              <motion.span
                className="absolute whitespace-nowrap text-xl font-black"
                style={{ color: b.textColor ?? '#16a34a', textShadow: '0 2px 0 #fff, 0 0 8px #fff', transform: 'translateX(-50%)' }}
                initial={{ y: -10, opacity: 0, scale: 0.6 }}
                animate={{ y: -58, opacity: [0, 1, 1, 0], scale: [0.6, 1.15, 1, 1] }}
                transition={{ duration: 1, ease: 'easeOut' }}
              >
                <span className="relative -left-1/2">{b.text}</span>
              </motion.span>
            )}
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
  return { fire, layer };
}

/** 元素中心相对容器的像素坐标 */
export function centerIn(box: HTMLElement | null, el: Element | null | undefined) {
  if (!box || !el) return null;
  const b = box.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2 - b.left, y: r.top + r.height / 2 - b.top };
}
