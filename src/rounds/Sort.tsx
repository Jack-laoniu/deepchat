import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { sfx } from '../fx/fx';
import { useGame } from '../game';
import { money, t } from '../i18n';
import type { SortRound } from '../lesson/schema';
import { centerIn, useBursts } from '../ui/Burst';
import { Emoji } from '../ui/Emoji';
import { HandHint, useHintPath } from '../ui/Hint';
import { Btn } from '../ui/kit';

/** 三种格子的配色：要的 → 绿，有更好 → 黄，不要 → 灰 */
function binLook(i: number, keep: boolean, n: number) {
  if (!keep && i === n - 1) return { kind: 'skip' as const, bg: '#F1F5F9', ring: '#94A3B8', deep: '#64748B', colors: ['#94a3b8', '#cbd5e1'] };
  if (i === 0) return { kind: 'must' as const, bg: '#DCFCE7', ring: '#22C55E', deep: '#15803D', colors: ['#22c55e', '#86efac', '#facc15'] };
  return { kind: 'nice' as const, bg: '#FEF3C7', ring: '#F59E0B', deep: '#B45309', colors: ['#f59e0b', '#fde68a', '#f472b6'] };
}

/**
 * 整理归类：一次只出一张大卡片（后面叠着下一张），下面三个大格子。
 * 把卡片拖进格子，或者直接点格子；放进去的东西堆在格子里，点一下拿回来重放。没有标准答案。
 */
export function Sort({ round }: { round: SortRound }) {
  const g = useGame();
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [order, setOrder] = useState(() => round.cards.map((c) => c.id));
  const [over, setOver] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<{ id: string; bin: string } | null>(null);
  const [squash, setSquash] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const combo = useRef({ n: 0, at: 0 });
  const binRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const cardRef = useRef<HTMLDivElement | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const { fire, layer } = useBursts();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-150, 150], [-12, 12]);

  const deck = order.filter((id) => !placed[id]);
  const card = round.cards.find((c) => c.id === deck[0]);
  const done = deck.length === 0;
  const touched = Object.keys(placed).length > 0;

  useEffect(() => {
    if (done) setTimeout(() => sfx.chime(), 250);
  }, [done]);

  const path = useHintPath(box, () => cardRef.current, () => binRefs.current[round.bins[0].id], [card?.id]);

  const binAt = (px: number, py: number) =>
    round.bins.find((b) => {
      const r = binRefs.current[b.id]?.getBoundingClientRect();
      return r && px >= r.left - 8 && px <= r.right + 8 && py >= r.top - 50 && py <= r.bottom + 8;
    })?.id ?? null;

  /** 放进格子：卡片飞过去缩小，格子回弹、迸彩屑 */
  const put = (binId: string) => {
    if (!card || leaving) return;
    sfx.whoosh();
    setOver(null);
    setLeaving({ id: card.id, bin: binId });
    setTimeout(() => {
      const i = round.bins.findIndex((b) => b.id === binId);
      const look = binLook(i, round.bins[i].keep, round.bins.length);
      const now = Date.now();
      combo.current = { n: now - combo.current.at < 2500 ? combo.current.n + 1 : 0, at: now };
      sfx.drop(combo.current.n);
      if (combo.current.n >= 2) setTimeout(() => sfx.sparkle(), 120);
      setPlaced((p) => ({ ...p, [card.id]: binId }));
      setLeaving(null);
      x.set(0);
      y.set(0);
      setSquash(binId);
      setTimeout(() => setSquash(null), 380);
      const at = centerIn(box.current, binRefs.current[binId]);
      const lines = t(look.kind === 'must' ? 'sortSayMust' : look.kind === 'nice' ? 'sortSayNice' : 'sortSaySkip').split('|');
      if (at) fire(at.x, at.y - 40, { colors: look.colors, text: lines[(now >> 4) % lines.length], textColor: look.deep, stars: look.kind !== 'skip' });
    }, 320);
  };

  /** 从格子里拿回来，放回牌堆最上面 */
  const takeBack = (id: string) => {
    sfx.lift();
    setPlaced(({ [id]: _, ...rest }) => rest);
    setOrder((o) => [id, ...o.filter((x) => x !== id)]);
  };

  const target = leaving ? centerIn(box.current, binRefs.current[leaving.bin]) : null;
  const origin = centerIn(box.current, cardRef.current);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-center gap-2">
        <Emoji e={round.emoji} size={30} />
        <h2 className="text-center text-[24px] font-black text-slate-700">{round.q}</h2>
      </div>

      {/* 进度：每张卡一个点，放好的显示它进了哪个格子的颜色 */}
      <div className="mb-1 flex justify-center gap-1.5">
        {round.cards.map((c) => {
          const b = placed[c.id];
          const i = round.bins.findIndex((x) => x.id === b);
          const look = b ? binLook(i, round.bins[i].keep, round.bins.length) : null;
          return <motion.span key={c.id} animate={{ scale: b ? [1.6, 1] : 1 }} className="h-2.5 w-6 rounded-full" style={{ background: look ? look.ring : '#E2E8F0' }} />;
        })}
      </div>

      <div ref={box} className="relative flex flex-1 flex-col">
        {/* 牌堆 */}
        <div className="relative flex flex-1 items-center justify-center">
          {deck.slice(1, 3).map((id, k) => (
            <div
              key={id}
              className="absolute aspect-[4/5] w-[52%] max-w-[220px] rounded-[28px] border-2 border-slate-200 bg-white"
              style={{ transform: `translateY(${(k + 1) * 9}px) rotate(${(k ? -1 : 1) * (k + 1) * 3}deg) scale(${1 - (k + 1) * 0.04})`, boxShadow: '0 6px 12px rgba(30,41,59,.12)', zIndex: 3 - k }}
            />
          ))}
          <AnimatePresence>
            {card && (
              <motion.div
                key={card.id}
                ref={cardRef}
                data-card={card.id}
                drag={!leaving}
                dragSnapToOrigin={!leaving}
                dragElastic={0.9}
                onDragStart={() => sfx.lift()}
                onDrag={(_, info) => setOver(binAt(info.point.x - window.scrollX, info.point.y - window.scrollY))}
                onDragEnd={(_, info) => {
                  const b = binAt(info.point.x - window.scrollX, info.point.y - window.scrollY);
                  if (b) put(b);
                  else setOver(null);
                }}
                style={{ x, y, rotate, zIndex: 10 }}
                initial={{ scale: 0.7, opacity: 0, y: 30 }}
                animate={
                  leaving && target && origin
                    ? { x: target.x - origin.x, y: target.y - origin.y, scale: 0.25, opacity: 0.6, rotate: 20 }
                    : { scale: 1, opacity: 1 }
                }
                exit={{ opacity: 0 }}
                transition={leaving ? { duration: 0.32, ease: 'easeIn' } : { type: 'spring', stiffness: 320, damping: 22 }}
                whileDrag={{ scale: 1.06 }}
                className="relative flex aspect-[4/5] w-[52%] max-w-[220px] cursor-grab touch-none flex-col items-center justify-center rounded-[28px] border-2 border-slate-200 bg-white px-3 shadow-[0_14px_28px_rgba(30,41,59,.18)] active:cursor-grabbing"
              >
                <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 2.2 }} style={{ filter: 'drop-shadow(2px 8px 6px rgba(0,0,0,.15))' }}>
                  <Emoji e={card.emoji} size={88} />
                </motion.div>
                <div className="mt-3 text-center text-[22px] font-black leading-tight text-slate-700">{card.label}</div>
                {card.item && card.item.price > 0 && (
                  <div className="mt-2 rounded-full bg-amber-100 px-3 py-0.5 text-base font-black text-amber-700">{money(card.item.price)}</div>
                )}
                {/* 拖到哪个格子上，卡片就染上那个格子的颜色 */}
                {over && (
                  <div
                    className="pointer-events-none absolute inset-0 rounded-[26px] border-[5px]"
                    style={{ borderColor: binLook(round.bins.findIndex((b) => b.id === over), round.bins.find((b) => b.id === over)!.keep, round.bins.length).ring }}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
          {/* 全部放好 */}
          <AnimatePresence>
            {done && (
              <motion.div
                initial={{ scale: 3, opacity: 0, rotate: -25 }}
                animate={{ scale: 1, opacity: 1, rotate: -8 }}
                transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.15 }}
                className="whitespace-nowrap rounded-2xl border-[5px] border-green-500 bg-white px-5 py-2 text-3xl font-black text-green-600 shadow-xl"
              >
                {t('sortDone')}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 三个大格子 */}
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${round.bins.length}, minmax(0, 1fr))` }}>
          {round.bins.map((b, i) => {
            const look = binLook(i, b.keep, round.bins.length);
            const inside = round.cards.filter((c) => placed[c.id] === b.id);
            const cost = b.keep !== false ? inside.reduce((s, c) => s + (c.item?.price ?? 0), 0) : 0;
            const hot = over === b.id;
            return (
              <motion.button
                key={b.id}
                data-bin={b.id}
                ref={(el) => (binRefs.current[b.id] = el)}
                onClick={() => put(b.id)}
                disabled={done}
                animate={squash === b.id ? { scaleY: [1, 0.86, 1.06, 1], scaleX: [1, 1.08, 0.97, 1] } : { scale: hot ? 1.06 : 1, y: hot ? -4 : 0 }}
                transition={squash === b.id ? { duration: 0.38 } : { type: 'spring', stiffness: 400, damping: 20 }}
                className="relative flex min-h-[132px] flex-col items-center rounded-3xl border-2 border-b-[6px] px-1 pb-2 pt-2.5 active:translate-y-0.5"
                style={{ background: look.bg, borderColor: look.ring, boxShadow: hot ? `0 0 0 4px ${look.ring}55` : undefined, originY: 1 }}
              >
                <Emoji e={b.emoji} size={34} />
                <div className="mt-1 text-base font-black" style={{ color: look.deep }}>
                  {b.label}
                </div>
                {/* 放进来的东西堆在格子里，点一下拿回去 */}
                <div className="mt-1.5 flex min-h-[30px] flex-wrap content-start justify-center gap-0.5">
                  <AnimatePresence>
                    {inside.map((c) => (
                      <motion.span
                        key={c.id}
                        role="button"
                        aria-label={c.label}
                        initial={{ scale: 0, y: -16 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 16 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          takeBack(c.id);
                        }}
                        className="rounded-lg bg-white/80 p-0.5 shadow-sm"
                      >
                        <Emoji e={c.emoji} size={24} />
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </div>
                {cost > 0 && (
                  <motion.div key={cost} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className="mt-auto rounded-full bg-white px-2 text-xs font-black" style={{ color: look.deep }}>
                    +{money(cost)}
                  </motion.div>
                )}
              </motion.button>
            );
          })}
        </div>
        {layer}
        {path && <HandHint show={!touched && !!card} mode="drag" from={path.from} to={path.to} delay={1500} />}
      </div>

      <div className="mt-2 text-center text-sm font-black text-slate-400">{card ? t('sortHint') : ' '}</div>
      <Btn
        className="mt-1"
        tone={done ? 'green' : 'white'}
        disabled={!done || sent}
        onClick={() => {
          setSent(true);
          g.sort(round, placed);
        }}
      >
        {done ? t('confirm') : t('sortLeft', { n: deck.length })}
      </Btn>
    </div>
  );
}
