import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { useGame } from '../game';
import { sfx } from '../fx/fx';
import { yuan } from '../lesson/output';
import { Emoji } from '../ui/Emoji';
import { Btn, Mascot, useCountUp } from '../ui/kit';

/** 盲猜亮相：物品一个个飞进来，总价跟着往上跳 */
export function Intro() {
  const g = useGame();
  const l = g.lesson!;
  const total = l.guess.items.reduce((s, i) => s + i.price, 0);
  const shown = useCountUp(total);

  useEffect(() => {
    const ts = l.guess.items.map((_, i) => setTimeout(sfx.tap, 400 + i * 180));
    return () => ts.forEach(clearTimeout);
  }, [l]);

  return (
    <div className="flex h-full flex-col px-5 pb-6 pt-8">
      <Mascot mood="happy" say={l.guess.line} size={88} />
      <div className="mt-6 grid flex-1 content-center grid-cols-3 gap-3">
        {l.guess.items.map((it, i) => (
          <motion.div
            key={it.id}
            initial={{ y: -200, opacity: 0, rotate: -30 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            transition={{ delay: 0.4 + i * 0.18, type: 'spring', stiffness: 260, damping: 15 }}
            className="flex flex-col items-center rounded-3xl border-2 border-b-[5px] border-slate-200 bg-white p-2"
          >
            <Emoji e={it.emoji} size={54} loop={false} />
            <div className="text-sm font-extrabold text-slate-700">{it.name}</div>
            <div className="text-xs font-black text-amber-600">{yuan(it.price)}</div>
          </motion.div>
        ))}
      </div>
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.5 + l.guess.items.length * 0.18 }} className="my-5 text-center">
        <div className="text-sm font-extrabold text-slate-400">我猜要花</div>
        <div className="text-5xl font-black tabular-nums text-slate-700">{yuan(shown)}</div>
      </motion.div>
      <Btn onClick={g.begin}>哪里不对？来找茬 →</Btn>
    </div>
  );
}
