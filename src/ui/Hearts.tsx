import { motion } from 'framer-motion';
import { MAX_HEARTS } from '../bond';

/** 交情：实心 / 空心的小心心；pop = 刚点亮的那几颗（弹一下） */
export function Hearts({ n, size = 14, pop = 0 }: { n: number; size?: number; pop?: number }) {
  return (
    <span className="inline-flex gap-0.5" style={{ fontSize: size, lineHeight: 1 }}>
      {Array.from({ length: MAX_HEARTS }, (_, i) => {
        const on = i < n;
        const fresh = on && i >= n - pop;
        return (
          <motion.span
            key={i}
            initial={fresh ? { scale: 0 } : false}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 12, delay: fresh ? 0.6 + (i - (n - pop)) * 0.25 : 0 }}
            className={on ? '' : 'opacity-25 grayscale'}
          >
            ❤️
          </motion.span>
        );
      })}
    </span>
  );
}
