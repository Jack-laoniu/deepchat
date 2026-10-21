import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useGame } from '../game';
import { sfx } from '../fx/fx';
import type { SwipeRound } from '../lesson/schema';
import { Emoji } from '../ui/Emoji';
import { HandHint } from '../ui/Hint';
import { t } from '../i18n';
import { useState } from 'react';

/** 左右滑卡：右滑 = yes，左滑 = no */
export function Swipe({ round }: { round: SwipeRound }) {
  const g = useGame();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-18, 18]);
  const yesOpacity = useTransform(x, [20, 120], [0, 1]);
  const noOpacity = useTransform(x, [-120, -20], [1, 0]);
  const [touched, setTouched] = useState(false);

  const decide = (yes: boolean) => {
    sfx.whoosh();
    setTouched(true);
    animate(x, yes ? 500 : -500, { duration: 0.3 }).then(() => g.choose(round, yes ? round.yes.id : round.no.id));
  };

  return (
    <div className="flex h-full flex-col items-center">
      <h2 className="mb-6 text-center text-[28px] font-black text-slate-700">{round.q}</h2>
      <div className="relative flex w-full flex-1 items-center justify-center">
        <motion.div
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.9}
          style={{ x, rotate }}
          onDragStart={() => setTouched(true)}
          onDragEnd={(_, info) => {
            if (info.offset.x > 110) decide(true);
            else if (info.offset.x < -110) decide(false);
          }}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative flex h-72 w-64 cursor-grab touch-none flex-col items-center justify-center rounded-[32px] border-2 border-b-8 border-slate-200 bg-white shadow-xl active:cursor-grabbing"
        >
          <Emoji e={round.emoji} size={150} loop />
          <motion.div style={{ opacity: yesOpacity }} className="absolute left-4 top-5 -rotate-12 rounded-xl border-4 border-green-500 px-2 text-2xl font-black text-green-500">
            {round.yes.label}
          </motion.div>
          <motion.div style={{ opacity: noOpacity }} className="absolute right-4 top-5 rotate-12 rounded-xl border-4 border-rose-500 px-2 text-2xl font-black text-rose-500">
            {round.no.label}
          </motion.div>
        </motion.div>
        <HandHint show={!touched} mode="drag" from={{ x: 50, y: 60 }} to={{ x: 80, y: 60 }} label={t('hintSwipe')} delay={1200} />
      </div>
      <div className="mt-6 flex w-full justify-center gap-10">
        <Choice emoji={round.no.emoji} label={round.no.label} tone="rose" onClick={() => decide(false)} />
        <Choice emoji={round.yes.emoji} label={round.yes.label} tone="green" onClick={() => decide(true)} />
      </div>
    </div>
  );
}

function Choice({ emoji, label, tone, onClick }: { emoji: string; label: string; tone: 'rose' | 'green'; onClick: () => void }) {
  const c = tone === 'green' ? 'border-green-500 text-green-600' : 'border-rose-400 text-rose-500';
  return (
    <motion.button whileTap={{ scale: 0.88 }} onClick={onClick} className="flex flex-col items-center gap-1">
      <span className={`flex h-20 w-20 items-center justify-center rounded-full border-4 border-b-[7px] bg-white ${c}`}>
        <Emoji e={emoji} size={46} />
      </span>
      <span className={`text-sm font-black ${c.split(' ')[1]}`}>{label}</span>
    </motion.button>
  );
}
