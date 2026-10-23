import { motion } from 'framer-motion';
import { useRef, useState } from 'react';
import { useGame } from '../game';
import { sfx, sparkle } from '../fx/fx';
import { gambleCrashes, optionDelta } from '../lesson/engine';
import type { FixRound, Option } from '../lesson/schema';
import { Emoji } from '../ui/Emoji';
import { PriceBadge } from '../ui/kit';
import { t } from '../i18n';

type Stage = 'idle' | 'fixed' | 'boom' | 'shrug';

const center = (el: HTMLElement | null) => {
  const r = el?.getBoundingClientRect();
  return r ? { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight } : { x: 0.5, y: 0.4 };
};

/** 修坑关：坏掉的东西在中间抖动冒火，把工具拖上去（或点一下）就修好 */
export function Fix({ round }: { round: FixRound }) {
  const g = useGame();
  const target = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [hover, setHover] = useState(false);
  const cart = g.played!.cart;

  const inTarget = (p: { x: number; y: number }) => {
    const r = target.current?.getBoundingClientRect();
    return !!r && p.x > r.left - 20 && p.x < r.right + 20 && p.y > r.top - 20 && p.y < r.bottom + 20;
  };

  const apply = (o: Option) => {
    if (stage !== 'idle') return;
    setStage('fixed');
    const c = center(target.current);
    sparkle(c.x, c.y);
    setTimeout(() => g.choose(round, o.id), 650);
  };

  const gamble = () => {
    if (stage !== 'idle') return;
    const crash = gambleCrashes(round.gamble, g.played!.flags);
    setStage(crash ? 'boom' : 'shrug');
    setTimeout(() => g.gamble(round), crash ? 500 : 450);
  };

  return (
    <div className="flex h-full flex-col">
      <h2 className="text-center text-[28px] font-black text-rose-500">{round.q}</h2>

      <div className="flex flex-1 items-center justify-center">
        <div ref={target} className="relative flex h-52 w-52 items-center justify-center">
          <motion.div
            className="absolute inset-0 rounded-full"
            animate={
              stage === 'fixed'
                ? { backgroundColor: 'rgba(34,197,94,0.25)', scale: 1.1 }
                : { backgroundColor: hover ? 'rgba(56,189,248,0.3)' : 'rgba(244,63,94,0.18)', scale: [1, 1.08, 1] }
            }
            transition={stage === 'fixed' ? { duration: 0.3 } : { repeat: Infinity, duration: 1.2 }}
          />
          <motion.div
            animate={
              stage === 'fixed' ? { rotate: 0, scale: [1, 1.25, 1] } :
              stage === 'boom' ? { scale: [1, 1.5, 0], rotate: 40, opacity: [1, 1, 0] } :
              stage === 'shrug' ? { rotate: [0, 10, -10, 0] } :
              { rotate: [0, -7, 7, -5, 5, 0] }
            }
            transition={stage === 'idle' ? { repeat: Infinity, duration: 0.7, repeatDelay: 0.5 } : { duration: 0.45 }}
          >
            <Emoji e={round.emoji} size={130} loop={stage === 'idle'} />
          </motion.div>
          {stage === 'idle' && (
            <>
              <motion.span className="absolute right-6 top-4" animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 0.8 }}>
                <Emoji e="🔥" size={44} loop />
              </motion.span>
              <span className="absolute -bottom-2 rounded-full bg-rose-500 px-3 py-1 text-sm font-black text-white shadow">{round.problem}</span>
            </>
          )}
          {stage === 'fixed' && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute right-4 top-4">
              <Emoji e="✨" size={56} loop />
            </motion.span>
          )}
          {stage === 'boom' && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: [0, 1.6, 1.2] }} className="absolute">
              <Emoji e="💥" size={150} replay={1} />
            </motion.span>
          )}
        </div>
      </div>

      <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 1.2 }} className="mb-2 text-center text-sm font-extrabold text-slate-400">
        {t('dragToFix')}
      </motion.div>
      <div className="flex justify-center gap-3">
        {round.options.map((o) => (
          <DragTool
            key={o.id}
            option={o}
            delta={optionDelta(cart, o)}
            disabled={stage !== 'idle'}
            onHover={(p) => setHover(inTarget(p))}
            onDrop={(p) => {
              setHover(false);
              if (inTarget(p)) apply(o);
            }}
            onTap={() => apply(o)}
          />
        ))}
        <motion.button
          whileTap={{ scale: 0.92 }}
          disabled={stage !== 'idle'}
          onClick={() => {
            sfx.tap();
            gamble();
          }}
          className="flex w-24 flex-col items-center gap-1 rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 p-2"
        >
          <Emoji e={round.gamble.emoji} size={52} />
          <span className="text-sm font-extrabold text-slate-500">{round.gamble.label}</span>
        </motion.button>
      </div>
    </div>
  );
}

function DragTool({
  option,
  delta,
  disabled,
  onHover,
  onDrop,
  onTap,
}: {
  option: Option;
  delta: number;
  disabled: boolean;
  onHover: (p: { x: number; y: number }) => void;
  onDrop: (p: { x: number; y: number }) => void;
  onTap: () => void;
}) {
  const dragged = useRef(false);
  return (
    <motion.button
      drag={!disabled}
      dragSnapToOrigin
      dragElastic={1}
      whileDrag={{ scale: 1.15, zIndex: 20, rotate: -6 }}
      whileTap={{ scale: 0.95 }}
      onDragStart={() => {
        dragged.current = true;
        sfx.tap();
      }}
      onDrag={(_, i) => onHover(i.point.x !== undefined ? { x: i.point.x - scrollX, y: i.point.y - scrollY } : { x: 0, y: 0 })}
      onDragEnd={(_, i) => {
        onDrop({ x: i.point.x - scrollX, y: i.point.y - scrollY });
        setTimeout(() => (dragged.current = false), 0);
      }}
      onClick={() => {
        if (!dragged.current && !disabled) {
          sfx.tap();
          onTap();
        }
      }}
      className="relative flex w-24 touch-none flex-col items-center gap-1 rounded-3xl border-2 border-b-[5px] border-sky-300 bg-white p-2 shadow-sm"
    >
      <Emoji e={option.emoji} size={52} />
      <span className="text-sm font-extrabold text-sky-600">{option.label}</span>
      <span className="absolute -right-2 -top-2">
        <PriceBadge delta={delta} />
      </span>
    </motion.button>
  );
}
