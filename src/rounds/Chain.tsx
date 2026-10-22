import { AnimatePresence, animate, motion, useMotionValue, useMotionValueEvent, useTransform } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  // 开局时的分数和清单固定下来：提交后全局状态会把这些选择算进去，再拿来当起点就重复计算了
  const [start] = useState(() => g.played!.score);
  const [cart] = useState(() => g.played!.cart);
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
  const stampLeft = useTransform(x, [-120, -30], [1, 0]);
  const stampRight = useTransform(x, [30, 120], [0, 1]);
  const flying = useRef(false);
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

  // 槽变化时飘出 +/- 数字；某条快见底时心跳
  const [deltas, setDeltas] = useState<{ id: number; d: Partial<Record<Meter, number>> } | null>(null);
  const [shake, setShake] = useState(0);
  const lowBefore = useRef(new Set<Meter>());
  useEffect(() => {
    const low = new Set(METERS.filter((k) => meters[k] < 25 && meters[k] > 0));
    if ([...low].some((k) => !lowBefore.current.has(k))) setTimeout(() => sfx.heartbeat(), 350);
    lowBefore.current = low;
  }, [meters]);
  useEffect(() => {
    if (broke) setShake((n) => n + 1);
  }, [broke]);
  // 撑到最后：先庆祝一下再进下一关
  const [cheer, setCheer] = useState(false);
  useEffect(() => {
    if (!finished) return;
    setCheer(true);
    sfx.chime();
  }, [finished]);

  const decide = (side: 'left' | 'right') => {
    if (!card || flying.current) return;
    flying.current = true;
    setTouched(true);
    sfx.swoosh(side === 'right');
    const d = preview(card[side], cartNow);
    void animate(x, side === 'right' ? 520 : -520, { duration: 0.28, ease: 'easeIn' }).then(() => {
      setPicks((p) => ({ ...p, [card.id]: side }));
      x.set(0);
      setLean(null);
      flying.current = false;
      setDeltas({ id: Date.now(), d });
      METERS.filter((k) => Math.abs(d[k] ?? 0) >= 1).forEach((k, i) => setTimeout(() => sfx.meter((d[k] ?? 0) > 0), i * 110));
    });
  };

  const remaining = round.cards.length - index;
  return (
    <motion.div className="relative flex h-full flex-col" animate={shake ? { x: [0, -14, 12, -8, 6, 0] } : {}} transition={{ duration: 0.5 }} key={`shake-${shake}`}>
      <div className="mb-2 flex items-center justify-center gap-2">
        <Emoji e={round.emoji} size={28} />
        <h2 className="text-2xl font-black text-slate-700">{round.title}</h2>
      </div>

      {/* 舞台：深色背景、两侧幕布、顶上的聚光灯 */}
      <div className="relative flex flex-1 flex-col rounded-[28px] border-2 border-b-[6px] border-indigo-950" style={{ overflow: 'clip', background: 'radial-gradient(80% 60% at 50% 38%, #3b3f8f 0%, #23265e 55%, #14163a 100%)' }}>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-7" style={{ background: 'repeating-linear-gradient(90deg,#9f1239 0 6px,#be123c 6px 12px)', boxShadow: '4px 0 10px rgba(0,0,0,.4)' }} />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-7" style={{ background: 'repeating-linear-gradient(90deg,#be123c 0 6px,#9f1239 6px 12px)', boxShadow: '-4px 0 10px rgba(0,0,0,.4)' }} />
        <div className="pointer-events-none absolute left-1/2 top-0 h-full w-[85%] -translate-x-1/2" style={{ background: 'conic-gradient(from 160deg at 50% -5%, transparent 0deg, rgba(255,245,200,.16) 20deg, rgba(255,245,200,.16) 40deg, transparent 60deg)' }} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[16%]" style={{ background: 'linear-gradient(180deg,#5b3b2a,#3d2618)' }} />

        {/* 四个药瓶 */}
        <div className="relative z-10 mx-8 mt-3 flex justify-around">
          {METERS.map((k) => (
            <Flask key={k} meter={k} value={meters[k]} preview={hint[k] ?? 0} delta={deltas?.d[k]} deltaKey={deltas?.id} broken={broke === k} />
          ))}
        </div>

        {/* 牌堆 + 当前卡 */}
        <div className="relative flex flex-1 items-center justify-center px-9 pb-[14%]">
          {Array.from({ length: Math.min(3, Math.max(0, remaining - 1)) }, (_, i) => (
            <div key={i} className="absolute h-[78%] w-[78%] max-w-[270px] rounded-[26px] border-2 border-slate-200 bg-slate-50" style={{ transform: `translateY(${(i + 1) * 7}px) rotate(${(i % 2 ? 1 : -1) * (i + 1) * 2.5}deg)`, boxShadow: '0 8px 16px rgba(0,0,0,.35)', zIndex: 3 - i }} />
          ))}
          <AnimatePresence mode="popLayout">
            {card && (
              <motion.div
                key={card.id}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.9}
                style={{ x, rotate, zIndex: 5 }}
                onDragStart={() => {
                  setTouched(true);
                  sfx.lift();
                }}
                onDragEnd={(_, info) => {
                  if (info.offset.x > 90) decide('right');
                  else if (info.offset.x < -90) decide('left');
                }}
                initial={{ scale: 0.85, opacity: 0, y: 40, rotate: -4 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                className="relative flex h-[78%] w-[78%] max-w-[270px] cursor-grab touch-none flex-col overflow-hidden rounded-[26px] border-2 border-slate-200 bg-white shadow-[0_18px_30px_rgba(0,0,0,.45)] active:cursor-grabbing"
              >
                {/* 顶部：谁在问 */}
                <div className="flex items-center gap-2 bg-gradient-to-r from-amber-100 to-orange-100 px-3 py-2">
                  <div className="overflow-hidden rounded-full border-2 border-white bg-white shadow">
                    <Character id={card.who} size={44} bust talking={!touched} />
                  </div>
                  <div className="text-sm font-black text-slate-600">{who(card.who).as ?? who(card.who).name}</div>
                  <div className="ml-auto text-xs font-black text-slate-400">{index + 1}/{round.cards.length}</div>
                </div>
                <div className="flex flex-1 flex-col items-center justify-center px-3 text-center">
                  <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 2.2 }} style={{ filter: 'drop-shadow(2px 6px 4px rgba(0,0,0,.2))' }}>
                    <Emoji e={card.emoji} size={70} />
                  </motion.div>
                  <div className="mt-2 text-[18px] font-extrabold leading-snug text-slate-700">{card.say}</div>
                </div>
                {/* 往哪边拖，哪边的印章盖上来 */}
                <motion.div style={{ opacity: stampLeft }} className="pointer-events-none absolute right-3 top-14 rotate-12 rounded-xl border-4 border-rose-500 bg-white/80 px-2 py-0.5 text-xl font-black text-rose-500">
                  {card.left.label}
                </motion.div>
                <motion.div style={{ opacity: stampRight }} className="pointer-events-none absolute left-3 top-14 -rotate-12 rounded-xl border-4 border-emerald-500 bg-white/80 px-2 py-0.5 text-xl font-black text-emerald-600">
                  {card.right.label}
                </motion.div>
                <div className="flex justify-between gap-2 border-t border-slate-100 px-3 py-2 text-[13px] font-black">
                  <span className={`rounded-lg px-1.5 py-0.5 ${lean === 'left' ? 'bg-rose-100 text-rose-600' : 'text-slate-400'}`}>👈 {card.left.label}</span>
                  <span className={`rounded-lg px-1.5 py-0.5 ${lean === 'right' ? 'bg-emerald-100 text-emerald-600' : 'text-slate-400'}`}>{card.right.label} 👉</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <HandHint show={!touched && !!card} mode="drag" from={{ x: 50, y: 48 }} to={{ x: 82, y: 48 }} label={t('hintSwipe')} delay={1500} />
        </div>

        {/* 撑到最后 */}
        <AnimatePresence>
          {cheer && !sent && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-indigo-950/50">
              <motion.div initial={{ scale: 0, rotate: -40 }} animate={{ scale: [0, 1.3, 1], rotate: 0 }} transition={{ duration: 0.6 }}>
                <Emoji e="🏅" size={110} loop />
              </motion.div>
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="mt-2 text-3xl font-black text-amber-300 drop-shadow">
                {t('chainSurvived')}
              </motion.div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="mt-5 w-56">
                <Btn onClick={() => submit()}>{t('next')}</Btn>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 翻车 */}
        <AnimatePresence>
          {broke && !sent && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-30 flex items-center justify-center px-6" style={{ background: 'radial-gradient(circle, rgba(127,29,29,.55), rgba(15,10,30,.85))' }}>
              <motion.div initial={{ scale: 0.5, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 13, delay: 0.25 }} className="w-full rounded-[28px] border-4 border-rose-400 bg-white p-5 text-center shadow-2xl">
                <div className="relative mx-auto w-fit">
                  <Emoji e={ICON[broke]} size={72} />
                  <motion.span className="absolute -right-4 -top-3" initial={{ scale: 0 }} animate={{ scale: [0, 1.4, 1] }} transition={{ delay: 0.4 }}>
                    <Emoji e="💥" size={44} />
                  </motion.span>
                </div>
                <div className="mt-2 text-3xl font-black text-rose-500">{t('chainBroke', { m: t(NAME[broke]) })}</div>
                <div className="mt-1 text-base font-extrabold text-slate-500">{t('chainBrokeSub', { m: t(NAME[broke]) })}</div>
                <div className="mt-5 space-y-3">
                  <Btn
                    onClick={() => {
                      sfx.whoosh();
                      setPicks({});
                      setDeltas(null);
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
    </motion.div>
  );
}

const LIQUID: [number, string, string][] = [
  [50, '#34d399', '#10b981'],
  [25, '#fcd34d', '#f59e0b'],
  [0, '#fb7185', '#e11d48'],
];

/** 一个玻璃药瓶：液面晃动、冒泡，变化时飘出数字，快见底变红闪烁 */
function Flask({ meter, value, preview, delta, deltaKey, broken }: { meter: Meter; value: number; preview: number; delta?: number; deltaKey?: number; broken: boolean }) {
  const [, c1, c2] = LIQUID.find(([min]) => value >= min) ?? LIQUID[2];
  const low = value < 25;
  return (
    <div className="relative flex flex-col items-center">
      {/* 拖动时的预告圆点 */}
      <div className="flex h-4 items-end">
        {Math.abs(preview) >= 1 && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="rounded-full bg-white shadow" style={{ width: Math.abs(preview) >= 15 ? 13 : 8, height: Math.abs(preview) >= 15 ? 13 : 8 }} />}
      </div>
      <motion.div animate={low && !broken ? { scale: [1, 1.08, 1] } : {}} transition={{ repeat: Infinity, duration: 0.8 }} className="relative h-[68px] w-[48px]">
        {/* 瓶身 */}
        <div className="absolute inset-x-[14px] top-0 h-3 rounded-t-md border-2 border-white/70 bg-white/20" />
        <div className={`absolute inset-x-0 bottom-0 top-2.5 overflow-hidden rounded-b-[20px] rounded-t-[12px] border-[3px] ${low ? 'border-rose-300' : 'border-white/70'} bg-white/15`}>
          <motion.div className="absolute inset-x-0 bottom-0" animate={{ height: `${value}%` }} transition={{ type: 'spring', stiffness: 90, damping: 14 }} style={{ background: `linear-gradient(180deg, ${c1}, ${c2})` }}>
            {/* 液面波浪 */}
            <motion.svg viewBox="0 0 96 10" preserveAspectRatio="none" className="absolute -top-[6px] left-0 h-[8px] w-[200%]" animate={{ x: ['0%', '-50%'] }} transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }}>
              <path d="M0 5 Q 12 0 24 5 T 48 5 T 72 5 T 96 5 V10 H0 Z" fill={c1} />
            </motion.svg>
            {[0, 1, 2].map((i) => (
              <motion.span key={i} className="absolute h-1.5 w-1.5 rounded-full bg-white/70" style={{ left: `${20 + i * 25}%` }} animate={{ bottom: ['0%', '95%'], opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.8 + i * 0.5, delay: i * 0.6 }} />
            ))}
          </motion.div>
          {/* 玻璃高光 */}
          <div className="absolute left-1.5 top-2 h-[60%] w-1.5 rounded-full bg-white/50" />
          <span className="absolute inset-0 flex items-center justify-center">
            <Emoji e={ICON[meter]} size={24} />
          </span>
        </div>
        {broken && (
          <motion.span className="absolute -right-3 -top-2" initial={{ scale: 0 }} animate={{ scale: [0, 1.5, 1] }}>
            <Emoji e="💥" size={30} />
          </motion.span>
        )}
      </motion.div>
      <span className={`mt-0.5 text-[11px] font-black ${low ? 'text-rose-300' : 'text-indigo-100'}`}>{t(NAME[meter])}</span>
      <AnimatePresence>
        {delta !== undefined && Math.abs(delta) >= 1 && (
          <motion.span
            key={deltaKey}
            initial={{ y: 0, opacity: 0, scale: 0.6 }}
            animate={{ y: -34, opacity: [0, 1, 1, 0], scale: 1.1 }}
            transition={{ duration: 1.2 }}
            className={`absolute top-0 text-lg font-black ${delta > 0 ? 'text-emerald-300' : 'text-rose-300'}`}
            style={{ textShadow: '0 2px 4px rgba(0,0,0,.5)' }}
          >
            {delta > 0 ? '+' : ''}
            {Math.round(delta)}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
