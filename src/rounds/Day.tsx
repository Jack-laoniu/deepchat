import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Character, type Act } from '../chars/Character';
import { sfx } from '../fx/fx';
import { useGame } from '../game';
import type { DayRound } from '../lesson/schema';
import { Emoji } from '../ui/Emoji';
import { HandHint } from '../ui/Hint';
import { DayLife, Sky } from '../ui/Scene';
import { centerIn, useBursts } from '../ui/Burst';

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

  // 每个时刻的环境声：早上鸟叫，夜里虫鸣
  useEffect(() => {
    const id = setTimeout(() => (m.at === 'morning' ? sfx.birds() : m.at === 'night' ? sfx.crickets() : undefined), 500);
    return () => clearTimeout(id);
  }, [m.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { fire, layer } = useBursts();
  const stage = useRef<HTMLDivElement>(null);
  const meRef = useRef<HTMLDivElement>(null);
  /** 时间流逝的过场（大钟转一圈） */
  const [passing, setPassing] = useState(false);

  const choose = (optionId: string) => {
    if (busy || done) return;
    sfx.drop(index);
    setTimeout(() => sfx.sparkle(), 120);
    setPendingId(optionId);
    setAct('party');
    const at = centerIn(stage.current, meRef.current);
    if (at) fire(at.x, at.y - 40, { colors: ['#facc15', '#fde68a', '#fb923c', '#f472b6'] });
    // 先在当前时刻停一下，看小人开心；再转钟推进时间
    setTimeout(() => {
      if (index < round.moments.length - 1) {
        setPassing(true);
        sfx.tick(5);
      }
    }, 1000);
    setTimeout(() => {
      setPicks((p) => ({ ...p, [m.id]: optionId }));
      setPendingId(null);
      setPassing(false);
    }, 1700);
  };

  return (
    <div className="flex h-full flex-col">
      {/* 顶部：数字时钟 + 一天的进度（不用读字） */}
      <div className="mb-2 flex flex-col items-center">
        <motion.div key={m.at} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-2 rounded-full bg-slate-800 px-4 py-1 font-black tabular-nums text-white shadow">
          <Emoji e={TIME_ICON[m.at]} size={22} />
          <span className="text-xl">{CLOCK[m.at]}</span>
        </motion.div>
        <div className="mt-1.5 flex gap-1.5">
          {round.moments.map((x, i) => (
            <motion.span key={x.id} className="h-2 rounded-full" animate={{ width: i === index ? 22 : 8, background: i < index ? '#22c55e' : i === index ? '#f59e0b' : '#cbd5e1' }} />
          ))}
        </div>
      </div>

      <div ref={stage} className="relative flex-1 rounded-[28px] border-2 border-b-[6px] border-slate-300" style={{ overflow: 'clip' }}>
        <Sky at={m.at} />
        <DayLife at={m.at} />
        {/* 场景道具 + 小人：站在小路上，带影子 */}
        <div className="absolute inset-x-0 bottom-[10%] flex items-end justify-center gap-5">
          <motion.div ref={meRef} key={m.id} initial={{ x: -90, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.9 }} className="relative" style={{ filter: 'drop-shadow(4px 8px 4px rgba(0,0,0,.35))' }}>
            <Character id="me" size={96} act={act} facing="right" mood={busy ? 'happy' : 'neutral'} />
            {/* 选中的那个冒成头顶的想法泡泡 */}
            <AnimatePresence>
              {showing && (
                <motion.div initial={{ scale: 0, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 14 }} className="absolute -top-16 left-1/2 -ml-9 flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white bg-white/95 shadow-xl">
                  <Emoji e={showing.emoji} size={48} loop />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
          <motion.div key={`p-${m.id}`} initial={{ y: -60, opacity: 0, scale: 0.6 }} animate={{ y: [0, -6, 0], opacity: 1, scale: 1 }} transition={{ y: { repeat: Infinity, duration: 2.4 }, default: { type: 'spring', stiffness: 260, damping: 14 } }} style={{ filter: 'drop-shadow(4px 8px 4px rgba(0,0,0,.35))' }}>
            <Emoji e={m.emoji} size={76} />
          </motion.div>
        </div>
        {/* 时间流逝：中间一个大钟转一圈 */}
        <AnimatePresence>
          {passing && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/25">
              <motion.div initial={{ scale: 0.4, rotate: 0 }} animate={{ scale: 1, rotate: 360 }} transition={{ duration: 0.7, ease: 'easeInOut' }}>
                <Emoji e="🕰️" size={96} />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        {layer}
      </div>

      {/* 选项：只有大图标（彩色描边、轻轻浮动），下面一行小字注释 */}
      <div className="relative mt-4 flex min-h-[124px] items-start justify-center gap-5">
        {!done &&
          m.options.map((o, i) => (
            <motion.button
              key={`${m.id}-${o.id}`}
              data-day-option={o.id}
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: busy ? 0 : [0, -5, 0], opacity: busy && showing?.id !== o.id ? 0.25 : 1, scale: showing?.id === o.id ? 1.12 : 1 }}
              transition={{ y: { repeat: busy ? 0 : Infinity, duration: 1.8, delay: i * 0.3 }, default: { duration: 0.25 } }}
              whileTap={{ scale: 0.85 }}
              onClick={() => choose(o.id)}
              className="flex flex-col items-center gap-1"
              aria-label={o.label}
            >
              <span className="flex h-[92px] w-[92px] items-center justify-center rounded-full border-4 border-b-[8px] bg-white shadow-lg" style={{ borderColor: RING[i % RING.length] }}>
                <Emoji e={o.emoji} size={58} />
              </span>
              <span className="text-xs font-extrabold text-slate-400">{o.label}</span>
            </motion.button>
          ))}
        <HandHint show={index === 0 && !busy} mode="tap" from={{ x: 50, y: 40 }} to={{ x: m.options.length === 2 ? 36 : 25, y: 38 }} delay={1800} />
      </div>
    </div>
  );
}

const CLOCK = { morning: '07:30', noon: '12:30', evening: '18:30', night: '22:00' } as const;
const RING = ['#f59e0b', '#38bdf8', '#f472b6'];
