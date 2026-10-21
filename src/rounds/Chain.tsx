import { AnimatePresence, animate, motion, useMotionValue, useMotionValueEvent, useTransform } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Character } from '../chars/Character';
import { sfx } from '../fx/fx';
import { speak } from '../fx/voice';
import { useGame } from '../game';
import { t, type MsgKey } from '../i18n';
import { chainMeters, METERS, optionDelta, type Meter } from '../lesson/engine';
import type { ChainRound, Option } from '../lesson/schema';
import { Emoji } from '../ui/Emoji';
import { HandHint } from '../ui/Hint';
import { Btn } from '../ui/kit';
import { useCast } from './Talk';

const ICON: Record<Meter, string> = { money: '💰', easy: '😌', good: '🎯', safe: '🛡️' };
const NAME: Record<Meter, MsgKey> = { money: 'meterMoney', easy: 'meterEasy', good: 'meterGood', safe: 'meterSafe' };

/** 这个选择会让各条槽动多少（用来在拖动时预告，像 Reigns 槽上方的小圆点） */
function preview(o: Option, cart: Parameters<typeof optionDelta>[0]): Partial<Record<Meter, number>> {
  const total = Math.max(1, cart.reduce((s, i) => s + i.price, 0));
  return { money: (-optionDelta(cart, o) / total) * 100, easy: o.score.easy ?? 0, good: o.score.good ?? 0, safe: o.score.safe ?? 0 };
}

/** 连环取舍：一张张两难卡，左右滑；四条槽涨落，见底就翻车 */
export function Chain({ round }: { round: ChainRound }) {
  const g = useGame();
  const who = useCast();
  const start = g.played!.score;
  const cart = g.played!.cart;
  const [picks, setPicks] = useState<Record<string, 'left' | 'right'>>({});
  const [touched, setTouched] = useState(false);
  const [lean, setLean] = useState<'left' | 'right' | null>(null);
  /** 已经提交过（防止连点重复提交） */
  const [sent, setSent] = useState(false);
  const submit = (accepted?: Meter) => {
    if (sent) return;
    setSent(true);
    g.chain(round, picks, accepted);
  };
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-14, 14]);
  useMotionValueEvent(x, 'change', (v) => setLean(v < -30 ? 'left' : v > 30 ? 'right' : null));

  const { meters, broke } = useMemo(() => chainMeters(start, cart, round.cards, picks), [start, cart, round.cards, picks]);
  const index = Object.keys(picks).length;
  const card = broke ? null : round.cards[index];
  const finished = !broke && index >= round.cards.length;
  // 购物车跟着已做的选择变化，预告才准
  const cartNow = useMemo(() => {
    let items = [...cart];
    for (const c of round.cards.slice(0, index)) {
      const o = c[picks[c.id]];
      items = items.filter((i) => !o.remove.includes(i.id) && !o.add.some((a) => a.id === i.id)).concat(o.add);
    }
    return items;
  }, [cart, round.cards, picks, index]);
  const hint = card && lean ? preview(card[lean], cartNow) : {};

  useEffect(() => {
    if (!card) return;
    const c = who(card.who);
    void speak(card.say, { pitch: c.pitch, rate: c.rate, gender: c.gender });
  }, [card?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (broke) sfx.crash();
  }, [broke]);

  useEffect(() => {
    if (finished) submit();
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  const decide = (side: 'left' | 'right') => {
    if (!card) return;
    setTouched(true);
    sfx.whoosh();
    void animate(x, side === 'right' ? 500 : -500, { duration: 0.25 }).then(() => {
      setPicks((p) => ({ ...p, [card.id]: side }));
      x.set(0);
      setLean(null);
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-center gap-2">
        <Emoji e={round.emoji} size={30} />
        <h2 className="text-2xl font-black text-slate-700">{round.title}</h2>
      </div>

      {/* 四条槽：竖着的瓶子，越满越好；拖动时上方的小圆点预告这次会动哪几条 */}
      <div className="mb-3 flex justify-around rounded-3xl bg-slate-800 px-3 py-3">
        {METERS.map((k) => {
          const d = hint[k] ?? 0;
          const v = meters[k];
          return (
            <div key={k} className="flex flex-col items-center gap-1">
              <div className="flex h-3 items-end">
                {Math.abs(d) >= 1 && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="rounded-full bg-white" style={{ width: Math.abs(d) >= 15 ? 12 : 7, height: Math.abs(d) >= 15 ? 12 : 7 }} />}
              </div>
              <div className="relative h-14 w-11 overflow-hidden rounded-xl border-2 border-slate-600 bg-slate-700">
                <motion.div
                  className={`absolute inset-x-0 bottom-0 ${v < 25 ? 'bg-rose-400' : v < 50 ? 'bg-amber-300' : 'bg-emerald-400'}`}
                  animate={{ height: `${v}%` }}
                  transition={{ type: 'spring', stiffness: 120, damping: 16 }}
                />
                <span className="absolute inset-0 flex items-center justify-center">
                  <Emoji e={ICON[k]} size={26} />
                </span>
              </div>
              <span className="text-[11px] font-black text-slate-300">{t(NAME[k])}</span>
            </div>
          );
        })}
      </div>

      <div className="relative flex flex-1 items-center justify-center">
        <AnimatePresence mode="popLayout">
          {card && (
            <motion.div
              key={card.id}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.9}
              style={{ x, rotate }}
              onDragStart={() => setTouched(true)}
              onDragEnd={(_, info) => {
                if (info.offset.x > 100) decide('right');
                else if (info.offset.x < -100) decide('left');
              }}
              initial={{ scale: 0.8, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="relative flex w-full max-w-[300px] cursor-grab touch-none flex-col items-center rounded-[32px] border-2 border-b-8 border-slate-200 bg-white px-4 pb-4 pt-3 shadow-xl active:cursor-grabbing"
            >
              <div className="text-xs font-black text-slate-300">{t('chainCard', { i: index + 1, n: round.cards.length })}</div>
              <div className="mt-1 flex items-end gap-2">
                <div className="overflow-hidden rounded-full bg-slate-100">
                  <Character id={card.who} size={64} bust />
                </div>
                <Emoji e={card.emoji} size={48} />
              </div>
              <div className="mt-1 text-xs font-black text-slate-400">{who(card.who).as ?? who(card.who).name}</div>
              <div className="mt-2 text-center text-[18px] font-extrabold leading-snug text-slate-700">{card.say}</div>
              {/* 拖向哪边，哪边的选项亮起来 */}
              <div className="mt-3 flex w-full justify-between gap-2 text-sm font-black">
                <span className={`rounded-xl border-2 px-2 py-1 transition ${lean === 'left' ? 'scale-110 border-rose-400 bg-rose-50 text-rose-600' : 'border-slate-200 text-slate-400'}`}>
                  👈 {card.left.label}
                </span>
                <span className={`rounded-xl border-2 px-2 py-1 transition ${lean === 'right' ? 'scale-110 border-emerald-400 bg-emerald-50 text-emerald-600' : 'border-slate-200 text-slate-400'}`}>
                  {card.right.label} 👉
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <HandHint show={!touched && !!card} mode="drag" from={{ x: 50, y: 55 }} to={{ x: 82, y: 55 }} label={t('hintSwipe')} delay={1500} />
      </div>

      {card && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Btn tone="white" onClick={() => decide('left')}>
            <span className="inline-flex items-center gap-1">
              <Emoji e={card.left.emoji} size={24} /> {card.left.label}
            </span>
          </Btn>
          <Btn tone="white" onClick={() => decide('right')}>
            <span className="inline-flex items-center gap-1">
              <Emoji e={card.right.emoji} size={24} /> {card.right.label}
            </span>
          </Btn>
        </div>
      )}

      {/* 翻车：哪条槽先见底，就说明一路在牺牲它。可以重来，也可以接受（接受的话记进交付物） */}
      <AnimatePresence>
        {broke && !sent && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-30 flex items-center justify-center bg-slate-900/60 px-6">
            <motion.div initial={{ scale: 0.6, rotate: -6 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }} className="w-full rounded-[28px] bg-white p-5 text-center">
              <Emoji e={ICON[broke]} size={72} />
              <div className="mt-2 text-3xl font-black text-rose-500">{t('chainBroke', { m: t(NAME[broke]) })}</div>
              <div className="mt-1 text-base font-extrabold text-slate-500">{t('chainBrokeSub', { m: t(NAME[broke]) })}</div>
              <div className="mt-5 space-y-3">
                <Btn
                  onClick={() => {
                    sfx.tap();
                    setPicks({});
                  }}
                >
                  {t('chainRetry')}
                </Btn>
                <Btn tone="white" onClick={() => submit(broke)}>
                  {t('chainAccept')}
                </Btn>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
