import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { playMusic, type Theme } from '../fx/music';
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
import { money, t } from '../i18n';
import { Emoji } from '../ui/Emoji';

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

/** 每种回合配什么音乐 */
function themeFor(r: Round): Theme {
  switch (r.type) {
    case 'talk':
      return 'story';
    case 'chain':
    case 'fix':
      return 'tension';
    case 'day':
      return `day_${r.moments[0].at}`;
    case 'boss':
      return 'boss';
    default:
      return 'explore';
  }
}

export function Play() {
  const g = useGame();
  const p = g.played!;
  const crashed = g.feedback?.tone === 'crash';
  const current = g.feedback?.round ?? p.current;

  useEffect(() => {
    if (current) playMusic(themeFor(current));
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div animate={crashed ? { x: [0, -14, 14, -10, 10, -4, 0] } : { x: 0 }} transition={{ duration: 0.5 }} className="flex h-full flex-col">
      <TopBar progress={p.done / p.estimate} hearts={g.hearts} total={p.total} budget={p.budget} streak={g.streak} onClose={g.home} />
      <PlanStrip />
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

/**
 * 方案一直在长：顶栏下面一条「我的方案」，每次选择都看得到东西加进来 / 被拿掉、总价在变。
 * 用户不用等到最后才看到成果。
 */
function PlanStrip() {
  const g = useGame();
  const p = g.played!;
  const shown = p.cart.slice(0, 9);
  return (
    <div className="mx-5 mt-1 flex items-center gap-1.5 rounded-2xl border-2 border-slate-100 bg-slate-50 px-2 py-1">
      <span className="text-xs font-black text-slate-400">{t('myPlan')}</span>
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
        <AnimatePresence initial={false}>
          {shown.map((it) => (
            <motion.span
              key={it.id}
              layout
              initial={{ scale: 0, y: -12 }}
              animate={{ scale: [0, 1.5, 1], y: 0 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.45 }}
              title={it.name}
            >
              <Emoji e={it.emoji} size={22} />
            </motion.span>
          ))}
        </AnimatePresence>
        {p.cart.length > shown.length && <span className="text-xs font-black text-slate-400">+{p.cart.length - shown.length}</span>}
      </div>
      <motion.span key={p.total} initial={{ scale: 1.4, color: '#f59e0b' }} animate={{ scale: 1, color: '#334155' }} className="text-sm font-black tabular-nums">
        {money(p.total)}
      </motion.span>
    </div>
  );
}
