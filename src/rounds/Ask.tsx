import { motion } from 'framer-motion';
import { Emoji } from '../ui/Emoji';

/** 每一关的「提问头」：大插画 + 一句短问题 */
export function Ask({ emoji, q, shake }: { emoji: string; q: string; shake?: boolean }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={shake ? { scale: 1, rotate: [0, -8, 8, -6, 6, 0] } : { scale: 1, rotate: 0 }}
        transition={shake ? { rotate: { repeat: Infinity, duration: 0.6, repeatDelay: 0.8 } } : { type: 'spring', stiffness: 260, damping: 14 }}
      >
        <Emoji e={emoji} size={76} loop />
      </motion.div>
      <motion.h2
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.1 }}
        className="text-[28px] font-black leading-tight text-slate-700"
      >
        {q}
      </motion.h2>
    </div>
  );
}
