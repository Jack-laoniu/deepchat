import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { friends, INVITE_AT } from '../bond';
import { Character } from '../chars/Character';
import { charById } from '../chars/library';
import { sfx } from '../fx/fx';
import { speakNow } from '../fx/voice';
import { Hearts } from '../ui/Hearts';
import { playMusic, type Theme } from '../fx/music';
import { useGame } from '../game';
import type { Round } from '../lesson/schema';
import { Pick } from '../rounds/Pick';
import { Fix } from '../rounds/Repair';
import { Finale, FinaleWait } from '../rounds/Finale';
import { Slider } from '../rounds/Slider';
import { Swipe } from '../rounds/Swipe';
import { Talk } from '../rounds/Talk';
import { MapQuest } from '../rounds/Map';
import { Chain } from '../rounds/Chain';
import { Sort } from '../rounds/Sort';
import { Place } from '../rounds/Place';
import { Day } from '../rounds/Day';
import { FeedbackSheet } from '../ui/FeedbackSheet';
import { RoundGuard } from '../ui/RoundGuard';
import { filledOf, puzzleOf } from '../lesson/puzzle';
import { TopBar } from '../ui/kit';
import { getLang, money, t } from '../i18n';
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
      return <Finale round={round} />;
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

/** 这一回合出错时跳过：交一个「什么都没选」的答案（选择题选第一个），接着往下走 */
function skip(g: ReturnType<typeof useGame>, r: Round) {
  switch (r.type) {
    case 'pick':
    case 'fix':
    case 'boss':
      return r.options[0] ? g.choose(r, r.options[0].id) : g.gamble(r);
    case 'swipe':
      return g.choose(r, r.yes.id);
    case 'slider':
      return g.setValue(r, Math.round((r.min + r.max) / 2 / r.step) * r.step);
    case 'talk':
    case 'map':
      return g.talk(r, {});
    case 'chain':
      return g.chain(r, {});
    case 'sort':
      return g.sort(r, {});
    case 'place':
      return g.place(r, {});
    case 'day':
      return g.day(r, {});
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
      <TopBar progress={p.done / p.estimate} puzzle={{ done: filledOf(g.lesson!, p).size, total: puzzleOf(g.lesson!, p).length }} total={p.total} budget={p.budget} streak={g.streak} onClose={g.home} />
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
              <RoundGuard round={current} title={g.lesson?.title ?? ''} onSkip={() => skip(g, current)} onHome={g.home}>
                {g.finaleWaiting && current.type === 'boss' ? <FinaleWait round={current} /> : <RoundView round={current} />}
              </RoundGuard>
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
      {current && current.type !== 'boss' && !g.feedback && <InviteFriend />}
      <FeedbackSheet fb={g.feedback} onNext={g.next} />
    </motion.div>
  );
}

/**
 * 叫熟人：交情够了、但这一关没出场的角色，可以请进来帮忙（每关一位）。
 * 他会马上打个招呼，终章由他来主持、按他的角度重写。
 */
function InviteFriend() {
  const g = useGame();
  const [open, setOpen] = useState(false);
  const [hello, setHello] = useState<string | null>(null);
  const list = useMemo(() => friends().filter((f) => f.hearts >= INVITE_AT && !g.lesson!.cast.some((c) => c.id === f.id)), [g.lesson]);
  useEffect(() => {
    if (!hello) return;
    const id = setTimeout(() => setHello(null), 3500);
    return () => clearTimeout(id);
  }, [hello]);
  if (g.guest && hello) return <Hello id={hello} />;
  if (g.guest || !list.length) return null;
  return (
    <>
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => (sfx.tap(), setOpen(true))}
        className="absolute bottom-2 left-3 z-20 flex items-center gap-1 rounded-full border-2 border-b-4 border-rose-200 bg-white py-0.5 pl-0.5 pr-2.5 shadow-sm"
      >
        <span className="overflow-hidden rounded-full bg-rose-50">
          <Character id={list[0].id} size={28} bust mood="happy" />
        </span>
        <span className="text-xs font-black text-rose-500">{t('inviteBtn')}</span>
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-t-3xl bg-white p-5"
            >
              <div className="text-lg font-black text-slate-700">{t('inviteTitle')}</div>
              <div className="text-xs font-bold text-slate-400">{t('inviteNote', { n: INVITE_AT })}</div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {list.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      sfx.good();
                      g.invite(f.id);
                      setOpen(false);
                      setHello(f.id);
                      const c = charById(f.id)!;
                      void speakNow(t('inviteJoined'), c.voice);
                    }}
                    className="flex flex-col items-center rounded-2xl border-2 border-b-4 border-rose-100 bg-rose-50 p-2"
                  >
                    <Character id={f.id} size={64} bust mood="happy" />
                    <span className="text-sm font-black text-slate-700">{charById(f.id)!.name[getLang()]}</span>
                    <Hearts n={f.hearts} size={10} />
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** 熟人进场：从左边探出来打个招呼（在题目上方，不挡按钮） */
function Hello({ id }: { id: string }) {
  return (
    <motion.div
      initial={{ x: -140, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -140, opacity: 0 }}
      transition={{ type: 'spring', damping: 18, stiffness: 220 }}
      className="pointer-events-none absolute left-2 top-24 z-30 flex flex-row-reverse items-start gap-1"
    >
      <div className="mt-3 max-w-[12rem] rounded-2xl rounded-tl-sm border-2 border-rose-100 bg-white px-3 py-2 text-sm font-black text-slate-700 shadow-md">{t('inviteJoined')}</div>
      <Character id={id} size={72} bust mood="happy" talking />
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
