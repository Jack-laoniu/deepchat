import { AnimatePresence, motion } from 'framer-motion';
import { useRef, useState } from 'react';
import { sfx } from '../fx/fx';
import { useGame } from '../game';
import { t } from '../i18n';
import type { SortRound } from '../lesson/schema';
import { Emoji } from '../ui/Emoji';
import { HandHint } from '../ui/Hint';
import { Btn } from '../ui/kit';

const BIN_TONE = ['border-emerald-400 bg-emerald-50', 'border-sky-400 bg-sky-50', 'border-slate-300 bg-slate-100'];

/**
 * 整理归类：把卡片拖进筐（或先点卡片再点筐）。没有标准答案，放错了点筐里的小图标拿回来。
 */
export function Sort({ round }: { round: SortRound }) {
  const g = useGame();
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const binRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const left = round.cards.filter((c) => !placed[c.id]);
  const touched = Object.keys(placed).length > 0 || picked !== null;

  const binAt = (x: number, y: number) =>
    round.bins.find((b) => {
      const r = binRefs.current[b.id]?.getBoundingClientRect();
      return r && x >= r.left && x <= r.right && y >= r.top - 20 && y <= r.bottom;
    })?.id ?? null;

  const put = (cardId: string, binId: string) => {
    sfx.coin();
    setPlaced((p) => ({ ...p, [cardId]: binId }));
    setPicked(null);
    setOver(null);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-1 flex items-center justify-center gap-2">
        <Emoji e={round.emoji} size={32} />
        <h2 className="text-center text-[26px] font-black text-slate-700">{round.q}</h2>
      </div>
      <div className="mb-3 text-center text-base font-black text-amber-700">{left.length ? t('sortHint') : ''}</div>

      <div className="relative flex flex-1 flex-col">
        {/* 待整理的卡片 */}
        <div className="flex flex-1 flex-wrap content-start justify-center gap-3">
          <AnimatePresence>
            {left.map((c) => (
              <motion.button
                key={c.id}
                layout
                drag
                dragSnapToOrigin
                whileDrag={{ scale: 1.1, zIndex: 50, rotate: -3 }}
                onDrag={(_, info) => setOver(binAt(info.point.x - window.scrollX, info.point.y - window.scrollY))}
                onDragEnd={(_, info) => {
                  const b = binAt(info.point.x - window.scrollX, info.point.y - window.scrollY);
                  if (b) put(c.id, b);
                  else setOver(null);
                }}
                onTap={() => {
                  sfx.tap();
                  setPicked((p) => (p === c.id ? null : c.id));
                }}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: picked === c.id ? 1.08 : 1, opacity: 1 }}
                exit={{ scale: 0.3, opacity: 0 }}
                className={`flex w-[30%] min-w-[92px] touch-none flex-col items-center rounded-2xl border-2 border-b-4 bg-white px-1 py-2 ${picked === c.id ? 'border-amber-400 ring-4 ring-amber-200' : 'border-slate-200'}`}
              >
                <Emoji e={c.emoji} size={40} />
                <span className="mt-1 text-center text-[13px] font-extrabold leading-tight text-slate-700">{c.label}</span>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>

        {/* 筐 */}
        <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${round.bins.length}, minmax(0, 1fr))` }}>
          {round.bins.map((b, i) => {
            const inside = round.cards.filter((c) => placed[c.id] === b.id);
            return (
              <motion.div
                key={b.id}
                ref={(el) => (binRefs.current[b.id] = el)}
                onClick={() => picked && put(picked, b.id)}
                animate={{ scale: over === b.id ? 1.06 : 1 }}
                className={`flex min-h-[112px] flex-col items-center rounded-2xl border-2 border-b-4 border-dashed p-2 ${BIN_TONE[i % BIN_TONE.length]} ${picked ? 'cursor-pointer' : ''}`}
              >
                <Emoji e={b.emoji} size={30} />
                <span className="text-sm font-black text-slate-600">{b.label}</span>
                <div className="mt-1 flex flex-wrap justify-center gap-0.5">
                  {inside.map((c) => (
                    <button
                      key={c.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        sfx.tap();
                        setPlaced(({ [c.id]: _, ...rest }) => rest);
                      }}
                      aria-label={c.label}
                    >
                      <Emoji e={c.emoji} size={24} />
                    </button>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>

        <HandHint show={!touched && left.length > 0} mode="drag" from={{ x: 20, y: 18 }} to={{ x: 100 / round.bins.length / 2, y: 88 }} delay={1500} />
      </div>

      <Btn
        className="mt-3"
        disabled={left.length > 0 || sent}
        onClick={() => {
          setSent(true);
          g.sort(round, placed);
        }}
      >
        {left.length ? t('sortLeft', { n: left.length }) : t('confirm')}
      </Btn>
    </div>
  );
}
