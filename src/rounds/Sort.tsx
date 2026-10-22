import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Character } from '../chars/Character';
import { GUIDE } from '../chars/library';
import { sfx } from '../fx/fx';
import { useGame } from '../game';
import { t } from '../i18n';
import type { SortRound } from '../lesson/schema';
import { centerIn, useBursts } from '../ui/Burst';
import { Emoji } from '../ui/Emoji';
import { HandHint, useHintPath } from '../ui/Hint';
import { Btn } from '../ui/kit';

/** 便签随手贴歪一点（固定角度，避免每次渲染乱跳） */
const TILT = [-6, 4, -3, 7, -5, 3, -2, 6];
const TAPE = ['#fde68a', '#bfdbfe', '#fbcfe8', '#bbf7d0'];

/** 筐的样子：要的放纸箱，最好有放篮子，不要的进垃圾桶 */
function binLook(i: number, keep: boolean, n: number) {
  if (!keep && i === n - 1) return { art: '🗑️', ring: '#94a3b8', colors: ['#94a3b8', '#cbd5e1'], kind: 'skip' as const };
  if (i === 0) return { art: '📦', ring: '#22c55e', colors: ['#22c55e', '#86efac', '#facc15'], kind: 'must' as const };
  return { art: '🧺', ring: '#38bdf8', colors: ['#38bdf8', '#a5f3fc', '#f472b6'], kind: 'nice' as const };
}

/**
 * 整理归类（「整理箱」）：桌上散着便签卡，拖进 / 点进纸箱、篮子、垃圾桶。没有标准答案。
 * 手感：拿起抬高、筐会张开迎接、飞进去有弧线、筐被压扁回弹、迸彩屑、连放音阶往上走、乐乐在旁边吐槽。
 */
export function Sort({ round }: { round: SortRound }) {
  const g = useGame();
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [fly, setFly] = useState<{ id: string; emoji: string; from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  const [squash, setSquash] = useState<string | null>(null);
  const [say, setSay] = useState<string>(t('sortIntro'));
  const [sent, setSent] = useState(false);
  const combo = useRef({ n: 0, at: 0 });
  const binRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const box = useRef<HTMLDivElement>(null);
  const { fire, layer } = useBursts();
  const left = round.cards.filter((c) => !placed[c.id] && fly?.id !== c.id);
  const done = Object.keys(placed).length === round.cards.length;
  const touched = Object.keys(placed).length > 0 || picked !== null;

  useEffect(() => {
    if (done) setTimeout(() => sfx.chime(), 250);
  }, [done]);

  const binAt = (x: number, y: number) =>
    round.bins.find((b) => {
      const r = binRefs.current[b.id]?.getBoundingClientRect();
      return r && x >= r.left - 10 && x <= r.right + 10 && y >= r.top - 40 && y <= r.bottom + 10;
    })?.id ?? null;

  const path = useHintPath(box, () => (left[0] ? cardRefs.current[left[0].id] : null), () => binRefs.current[round.bins[0].id], [left[0]?.id]);

  /** 放进筐：先沿弧线飞过去，落下时筐回弹、迸彩屑、乐乐说一句 */
  const put = (cardId: string, binId: string, from?: { x: number; y: number }) => {
    const c = round.cards.find((x) => x.id === cardId)!;
    const start = from ?? centerIn(box.current, cardRefs.current[cardId]);
    const end = centerIn(box.current, binRefs.current[binId]);
    setPicked(null);
    setOver(null);
    if (!start || !end) return land(cardId, binId);
    sfx.whoosh();
    setFly({ id: cardId, emoji: c.emoji, from: start, to: { x: end.x, y: end.y - 20 } });
    setTimeout(() => land(cardId, binId), 380);
  };

  const land = (cardId: string, binId: string) => {
    const i = round.bins.findIndex((b) => b.id === binId);
    const look = binLook(i, round.bins[i].keep, round.bins.length);
    const now = Date.now();
    combo.current = { n: now - combo.current.at < 2500 ? combo.current.n + 1 : 0, at: now };
    sfx.drop(combo.current.n);
    if (combo.current.n >= 2) setTimeout(() => sfx.sparkle(), 120);
    setFly(null);
    setPlaced((p) => ({ ...p, [cardId]: binId }));
    setSquash(binId);
    setTimeout(() => setSquash(null), 380);
    const at = centerIn(box.current, binRefs.current[binId]);
    const lines = t(look.kind === 'must' ? 'sortSayMust' : look.kind === 'nice' ? 'sortSayNice' : 'sortSaySkip').split('|');
    if (at) fire(at.x, at.y - 30, { colors: look.colors, text: `${round.bins[i].label}${look.kind === 'skip' ? '' : '!'}`, textColor: look.ring, stars: look.kind !== 'skip' });
    setSay(lines[(now >> 4) % lines.length]);
  };

  const takeBack = (cardId: string) => {
    sfx.lift();
    setPlaced(({ [cardId]: _, ...rest }) => rest);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-center gap-2">
        <Emoji e={round.emoji} size={30} />
        <h2 className="text-center text-[24px] font-black text-slate-700">{round.q}</h2>
      </div>
      {/* 进度 */}
      <div className="mb-2 flex items-center gap-2 px-1">
        <div className="relative h-3.5 flex-1 overflow-hidden rounded-full bg-slate-200">
          <motion.div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-300 to-green-400" animate={{ width: `${(Object.keys(placed).length / round.cards.length) * 100}%` }} />
        </div>
        <motion.span animate={done ? { scale: [1, 1.5, 1], rotate: [0, 20, 0] } : {}}>
          <Emoji e="⭐" size={24} />
        </motion.span>
      </div>

      <div ref={box} className="relative flex flex-1 flex-col">
        <div className="relative flex flex-1 flex-col rounded-[28px] border-2 border-b-[6px] border-amber-200" style={{ overflow: 'clip' }}>
          {/* 场景：暖墙 + 架子 + 灯光 + 木桌 */}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,#fff4e0 0%,#fde7c8 58%,#f6d9b2 100%)' }} />
          <div className="absolute inset-x-0 top-0 h-[58%] opacity-50" style={{ background: 'repeating-linear-gradient(90deg,transparent 0 22px,rgba(255,255,255,.5) 22px 24px)' }} />
          <div className="absolute left-3 right-3 top-[13%] h-2.5 rounded bg-[#b07a4a] shadow-[0_5px_6px_rgba(90,50,20,.3)]" />
          <div className="absolute left-5 top-[13%] flex -translate-y-full items-end gap-2 opacity-90">
            <Emoji e="🪴" size={30} />
            <Emoji e="📚" size={26} />
          </div>
          <div className="absolute left-[42%] top-[13%] -translate-y-full opacity-90">
            <Emoji e="🕰️" size={26} />
          </div>
          <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(70% 55% at 18% 0%, rgba(255,236,190,.9), rgba(255,236,190,0) 70%)' }} />
          <div className="absolute inset-x-0 bottom-0 h-[38%]" style={{ background: 'linear-gradient(180deg,#c48a57,#9c6a40)' }}>
            <div className="absolute inset-x-0 top-0 h-2 bg-[#d9a676]" />
            <div className="absolute inset-0 opacity-25" style={{ background: 'repeating-linear-gradient(0deg,transparent 0 16px,rgba(60,30,10,.4) 16px 17px)' }} />
          </div>
          <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(95% 85% at 45% 40%, rgba(0,0,0,0) 60%, rgba(60,30,10,.2) 100%)' }} />

          {/* 乐乐在右上角看着，时不时吐槽一句 */}
          <div className="absolute right-2 top-2 z-10 flex items-start gap-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={say}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                className="mt-2 max-w-[180px] rounded-2xl rounded-tr-sm border-2 border-orange-200 bg-white px-2 py-1 text-[13px] font-extrabold leading-snug text-slate-700 shadow"
              >
                {say}
              </motion.div>
            </AnimatePresence>
            <div className="overflow-hidden rounded-full border-2 border-white bg-orange-100 shadow">
              <Character id={GUIDE} size={48} bust mood={done ? 'happy' : 'neutral'} talking={false} />
            </div>
          </div>

          {/* 便签卡 */}
          <div className="relative z-[5] flex flex-1 flex-wrap content-center justify-center gap-x-3 gap-y-5 px-3 pb-[34%] pt-[18%]">
            <AnimatePresence>
              {left.map((c) => {
                const i = round.cards.findIndex((x) => x.id === c.id);
                return (
                  <motion.button
                    key={c.id}
                    data-card={c.id}
                    ref={(el) => (cardRefs.current[c.id] = el)}
                    layout
                    drag
                    dragSnapToOrigin
                    onDragStart={() => sfx.lift()}
                    whileDrag={{ scale: 1.15, zIndex: 50, rotate: 0, boxShadow: '0 18px 28px rgba(60,30,10,.35)' }}
                    onDrag={(_, info) => setOver(binAt(info.point.x - window.scrollX, info.point.y - window.scrollY))}
                    onDragEnd={(_, info) => {
                      const b = binAt(info.point.x - window.scrollX, info.point.y - window.scrollY);
                      if (!b) return setOver(null);
                      const bx = box.current!.getBoundingClientRect();
                      put(c.id, b, { x: info.point.x - window.scrollX - bx.left, y: info.point.y - window.scrollY - bx.top });
                    }}
                    onTap={() => {
                      if (picked === c.id) return setPicked(null);
                      sfx.lift();
                      setPicked(c.id);
                    }}
                    initial={{ scale: 0.5, opacity: 0, y: -30 }}
                    animate={{ scale: picked === c.id ? 1.12 : 1, opacity: 1, y: picked === c.id ? -8 : 0, rotate: picked === c.id ? 0 : TILT[i % TILT.length] }}
                    exit={{ scale: 0.2, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 20 }}
                    className={`relative flex w-[29%] min-w-[92px] touch-none flex-col items-center rounded-lg bg-white px-1 pb-2.5 pt-3.5 ${picked === c.id ? 'ring-4 ring-amber-300' : ''}`}
                    style={{ boxShadow: picked === c.id ? '0 16px 24px rgba(60,30,10,.3)' : '2px 5px 8px rgba(60,30,10,.22)' }}
                  >
                    <span className="absolute -top-2 left-1/2 h-4 w-12 -translate-x-1/2 rotate-[-3deg] rounded-sm opacity-80" style={{ background: TAPE[i % TAPE.length] }} />
                    <Emoji e={c.emoji} size={48} />
                    <span className="mt-1 text-center text-[14px] font-extrabold leading-tight text-slate-700">{c.label}</span>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>

          {/* 筐：放在桌上 */}
          <div className="absolute inset-x-0 bottom-0 z-[6] grid gap-2 px-2 pb-3" style={{ gridTemplateColumns: `repeat(${round.bins.length}, minmax(0, 1fr))` }}>
            {round.bins.map((b, i) => {
              const look = binLook(i, b.keep, round.bins.length);
              const inside = round.cards.filter((c) => placed[c.id] === b.id);
              const hot = over === b.id || (picked !== null && !fly);
              return (
                <div key={b.id} data-bin={b.id} ref={(el) => (binRefs.current[b.id] = el)} onClick={() => picked && put(picked, b.id)} className={`flex flex-col items-center ${picked ? 'cursor-pointer' : ''}`}>
                  {/* 放进去的东西从筐口冒出来，点一下拿回 */}
                  <div className="relative z-10 -mb-5 flex h-9 items-end justify-center">
                    {inside.map((c, k) => (
                      <motion.button
                        key={c.id}
                        initial={{ y: -30, scale: 0.4 }}
                        animate={{ y: 0, scale: 1, rotate: (k % 2 ? 12 : -12) * (k ? 1 : 0.4) }}
                        transition={{ type: 'spring', stiffness: 400, damping: 14 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          takeBack(c.id);
                        }}
                        className="-mx-1.5"
                        aria-label={c.label}
                      >
                        <Emoji e={c.emoji} size={30} />
                      </motion.button>
                    ))}
                  </div>
                  <motion.div
                    animate={
                      squash === b.id
                        ? { scaleY: [1, 0.78, 1.1, 1], scaleX: [1, 1.15, 0.95, 1] }
                        : over === b.id
                          ? { scale: 1.16, rotate: [0, -4, 4, 0] }
                          : hot
                            ? { scale: [1, 1.06, 1] }
                            : { scale: 1 }
                    }
                    transition={squash === b.id ? { duration: 0.38 } : hot && over !== b.id ? { repeat: Infinity, duration: 1 } : { duration: 0.25 }}
                    style={{ filter: `drop-shadow(3px 8px 4px rgba(60,30,10,.35))${over === b.id ? ` drop-shadow(0 0 10px ${look.ring})` : ''}`, originY: 1 }}
                  >
                    <Emoji e={look.art} size={78} />
                  </motion.div>
                  <div className="relative -mt-1 flex items-center gap-1 rounded-full border-2 bg-white px-2 py-0.5 text-sm font-black text-slate-700 shadow" style={{ borderColor: look.ring }}>
                    <Emoji e={b.emoji} size={16} /> {b.label}
                    {inside.length > 0 && (
                      <motion.span key={inside.length} initial={{ scale: 1.8 }} animate={{ scale: 1 }} className="ml-0.5 rounded-full px-1.5 text-xs text-white" style={{ background: look.ring }}>
                        {inside.length}
                      </motion.span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 整理完毕的章 */}
          <AnimatePresence>
            {done && (
              <div className="pointer-events-none absolute inset-x-0 top-[30%] z-20 flex justify-center">
                <motion.div
                  initial={{ scale: 3, opacity: 0, rotate: -25 }}
                  animate={{ scale: 1, opacity: 1, rotate: -8 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.2 }}
                  className="whitespace-nowrap rounded-2xl border-[5px] border-green-500 bg-white/90 px-5 py-2 text-3xl font-black text-green-600 shadow-xl"
                >
                  {t('sortDone')}
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* 飞向筐的那一下 */}
        {fly && (
          <motion.div
            className="pointer-events-none absolute z-[240]"
            style={{ left: 0, top: 0, marginLeft: -22, marginTop: -22 }}
            initial={{ x: fly.from.x, y: fly.from.y, scale: 1.1, rotate: 0 }}
            animate={{ x: [fly.from.x, (fly.from.x + fly.to.x) / 2, fly.to.x], y: [fly.from.y, Math.min(fly.from.y, fly.to.y) - 70, fly.to.y], scale: [1.1, 1.2, 0.6], rotate: [0, 180, 360] }}
            transition={{ duration: 0.38, ease: 'easeIn' }}
          >
            <Emoji e={fly.emoji} size={44} />
          </motion.div>
        )}
        {layer}
        {path && <HandHint show={!touched && left.length > 0} mode="drag" from={path.from} to={path.to} delay={1500} />}
      </div>

      <div className="mt-2 text-center text-sm font-black text-amber-700">{left.length ? t('sortHint') : ' '}</div>
      <Btn
        className="mt-1"
        tone={done ? 'green' : 'white'}
        disabled={!done || sent}
        onClick={() => {
          setSent(true);
          g.sort(round, placed);
        }}
      >
        {done ? t('confirm') : t('sortLeft', { n: round.cards.length - Object.keys(placed).length })}
      </Btn>
    </div>
  );
}
