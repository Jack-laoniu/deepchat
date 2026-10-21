import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Character, type Act } from '../chars/Character';
import { sfx } from '../fx/fx';
import { useGame } from '../game';
import type { DayRound } from '../lesson/schema';
import { Emoji } from '../ui/Emoji';
import { HandHint } from '../ui/Hint';
import { Sky } from '../ui/Scene';

const TIME_ICON = { morning: '🌅', noon: '☀️', evening: '🌇', night: '🌙' } as const;

/**
 * 无文字的一天：天色从早到晚，每个时刻点一个大图标（几乎不用读字）。
 * 选完角色做个反应、选中的图标落到场景里，时间走到下一刻。
 */
export function Day({ round }: { round: DayRound }) {
  const g = useGame();
  const [picks, setPicks] = useState<Record<string, string>>({});
  /** 刚点的选项：先在当前时刻展示一下，再推进时间 */
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const index = Object.keys(picks).length;
  const m = round.moments[Math.min(index, round.moments.length - 1)];
  const done = index >= round.moments.length;
  const busy = pendingId !== null;
  const showing = busy ? m.options.find((o) => o.id === pendingId) ?? null : null;
  const [act, setAct] = useState<Act>('walk');

  // 每到一个新时刻，小人先走进画面
  useEffect(() => {
    setAct('walk');
    const id = setTimeout(() => setAct('idle'), 900);
    return () => clearTimeout(id);
  }, [m.id]);

  useEffect(() => {
    if (done && !sent) {
      setSent(true);
      setTimeout(() => g.day(round, picks), 700);
    }
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (optionId: string) => {
    if (busy || done) return;
    sfx.good();
    setPendingId(optionId);
    setAct('jump');
    setTimeout(() => {
      setPicks((p) => ({ ...p, [m.id]: optionId }));
      setPendingId(null);
    }, 1100);
  };

  return (
    <div className="flex h-full flex-col">
      {/* 进度：每个时刻一个小图标 */}
      <div className="mb-2 flex items-center justify-center gap-2">
        {round.moments.map((x, i) => (
          <motion.span key={x.id} animate={{ scale: i === index ? 1.25 : 1, opacity: i <= index ? 1 : 0.35 }}>
            <Emoji e={TIME_ICON[x.at]} size={26} />
          </motion.span>
        ))}
      </div>

      <div className="relative flex-1 rounded-[28px] border-2 border-b-[6px] border-slate-300" style={{ overflow: 'clip' }}>
        <Sky at={m.at} />
        {/* 场景道具 + 小人：站在地面上，带影子 */}
        <div className="absolute inset-x-0 bottom-[20%] flex items-end justify-center gap-6">
          <motion.div key={m.id} initial={{ x: -80, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.9 }} style={{ filter: 'drop-shadow(4px 8px 4px rgba(0,0,0,.35))' }}>
            <Character id="me" size={92} act={act} facing="right" mood={busy ? 'happy' : 'neutral'} />
          </motion.div>
          <AnimatePresence mode="wait">
            <motion.div
              key={showing ? `c-${showing.id}` : `p-${m.id}`}
              initial={{ y: -60, opacity: 0, scale: 0.6 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ type: 'spring', stiffness: 260, damping: 14 }}
              style={{ filter: 'drop-shadow(4px 8px 4px rgba(0,0,0,.35))' }}
            >
              <Emoji e={showing ? showing.emoji : m.emoji} size={86} loop={!!showing} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* 选项：只有大图标，下面一行小字注释 */}
      <div className="relative mt-4 flex min-h-[118px] items-start justify-center gap-5">
        {!done &&
          m.options.map((o) => (
            <motion.button
              key={`${m.id}-${o.id}`}
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: busy && showing?.id !== o.id ? 0.3 : 1 }}
              whileTap={{ scale: 0.88 }}
              onClick={() => choose(o.id)}
              className="flex flex-col items-center gap-1"
              aria-label={o.label}
            >
              <span className="flex h-[84px] w-[84px] items-center justify-center rounded-full border-4 border-b-[7px] border-slate-200 bg-white shadow-md">
                <Emoji e={o.emoji} size={52} />
              </span>
              <span className="text-xs font-extrabold text-slate-400">{o.label}</span>
            </motion.button>
          ))}
        <HandHint show={index === 0 && !busy} mode="tap" from={{ x: 50, y: 40 }} to={{ x: m.options.length === 2 ? 36 : 25, y: 38 }} delay={1800} />
      </div>
    </div>
  );
}
