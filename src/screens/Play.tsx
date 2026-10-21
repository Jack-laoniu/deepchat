import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '../game';
import type { Round } from '../lesson/schema';
import { Pick } from '../rounds/Pick';
import { Boss, Fix } from '../rounds/Repair';
import { Slider } from '../rounds/Slider';
import { Swipe } from '../rounds/Swipe';
import { Talk } from '../rounds/Talk';
import { MapQuest } from '../rounds/Map';
import { Chain } from '../rounds/Chain';
import { Sort } from '../rounds/Sort';
import { Place } from '../rounds/Place';
import { Day } from '../rounds/Day';
import { FeedbackSheet } from '../ui/FeedbackSheet';
import { TopBar } from '../ui/kit';
import { t } from '../i18n';

function RoundView({ round }: { round: Round }) {
  switch (round.type) {
    case 'pick':
      return <Pick round={round} />;
    case 'swipe':
      return <Swipe round={round} />;
    case 'slider':
      return <Slider round={round} />;
    case 'fix':
      return <Fix round={round} />;
    case 'boss':
      return <Boss round={round} />;
    case 'talk':
      return <Talk round={round} />;
    case 'map':
      return <MapQuest round={round} />;
    case 'chain':
      return <Chain round={round} />;
    case 'sort':
      return <Sort round={round} />;
    case 'place':
      return <Place round={round} />;
    case 'day':
      return <Day round={round} />;
  }
}

export function Play() {
  const g = useGame();
  const p = g.played!;
  const crashed = g.feedback?.tone === 'crash';
  const current = g.feedback?.round ?? p.current;

  return (
    <motion.div animate={crashed ? { x: [0, -14, 14, -10, 10, -4, 0] } : { x: 0 }} transition={{ duration: 0.5 }} className="flex h-full flex-col">
      <TopBar progress={p.done / p.estimate} hearts={g.hearts} total={p.total} budget={p.budget} streak={g.streak} onClose={g.home} />
      <div className="relative flex-1 overflow-hidden px-5 pb-6 pt-6">
        <AnimatePresence mode="wait">
          {current && (
            <motion.div
              key={`${current.id}-${g.crashes.length - (crashed ? 1 : 0)}`}
              initial={{ x: 80, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -80, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="h-full"
            >
              <RoundView round={current} />
            </motion.div>
          )}
        </AnimatePresence>
        {/* 反馈出现时锁住画面 */}
        {g.feedback && <div className="absolute inset-0 z-10" />}
      </div>
      {p.done > 0 && !g.feedback && (
        <button onClick={g.undo} className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs font-extrabold text-slate-300 hover:text-slate-500">
          {t('undo')}
        </button>
      )}
      <AnimatePresence>
        {crashed && (
          <motion.div
            className="pointer-events-none fixed inset-0 z-20 bg-rose-500"
            initial={{ opacity: 0.5 }}
            animate={{ opacity: [0.5, 0.1, 0.3, 0] }}
            transition={{ duration: 0.9 }}
          />
        )}
      </AnimatePresence>
      <FeedbackSheet fb={g.feedback} onNext={g.next} />
    </motion.div>
  );
}
