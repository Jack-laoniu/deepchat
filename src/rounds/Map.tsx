import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { sfx } from '../fx/fx';
import { useGame } from '../game';
import { walkBeats, type Replies } from '../lesson/engine';
import type { MapRound } from '../lesson/schema';
import { Emoji } from '../ui/Emoji';
import { Btn } from '../ui/kit';
import { Dialogue, useCast } from './Talk';

const DECOR = [
  { e: '🌳', x: 8, y: 14 }, { e: '🌲', x: 90, y: 20 }, { e: '🌼', x: 30, y: 88 }, { e: '🌳', x: 70, y: 92 },
  { e: '🪨', x: 52, y: 8 }, { e: '🌷', x: 6, y: 60 }, { e: '🌲', x: 94, y: 70 }, { e: '🐓', x: 44, y: 54 },
];

/** 地图关：点地点，小人走过去，和那里的人聊完打个勾；全部聊完才能出发 */
export function MapQuest({ round }: { round: MapRound }) {
  const g = useGame();
  const who = useCast();
  const [done, setDone] = useState<Record<string, Replies>>({});
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const [open, setOpen] = useState<string | null>(null);
  const spot = round.spots.find((s) => s.id === open);
  const allDone = round.spots.every((s) => done[s.id]);

  // 先聊完的地点里设的标记，会影响后面地点的对话
  const flags = useMemo(() => {
    let f = g.played!.flags;
    for (const s of round.spots) if (done[s.id]) f = walkBeats(s.beats, done[s.id], f).flags;
    return f;
  }, [done, g.played, round.spots]);

  const go = (id: string) => {
    const s = round.spots.find((x) => x.id === id)!;
    if (done[id]) return;
    sfx.whoosh();
    setPos({ x: s.x, y: s.y + 9 });
    setTimeout(() => setOpen(id), 650);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-2">
        <Emoji e={round.emoji} size={40} loop />
        <h2 className="text-2xl font-black text-slate-700">{round.title}</h2>
      </div>

      {/* 任务清单 */}
      <div className="mb-3 flex flex-wrap gap-2">
        {round.spots.map((s) => (
          <span key={s.id} className={`rounded-full px-2.5 py-1 text-xs font-black ${done[s.id] ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            {done[s.id] ? '✅' : '⬜'} 找{who(s.who).name}
          </span>
        ))}
      </div>

      <div className="relative flex-1 overflow-hidden rounded-[28px] border-2 border-b-[6px] border-green-300 bg-gradient-to-b from-lime-200 via-green-200 to-emerald-300">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {round.spots.map((s) => (
            <path key={s.id} d={`M 50 50 Q ${(50 + s.x) / 2} ${s.y + 12} ${s.x} ${s.y + 6}`} fill="none" stroke="#fef3c7" strokeWidth="3.2" strokeLinecap="round" />
          ))}
        </svg>
        {DECOR.map((d, i) => (
          <span key={i} className="absolute -translate-x-1/2 -translate-y-1/2 opacity-90" style={{ left: `${d.x}%`, top: `${d.y}%` }}>
            <Emoji e={d.e} size={30} />
          </span>
        ))}

        {round.spots.map((s) => {
          const c = who(s.who);
          return (
            <motion.button
              key={s.id}
              whileTap={{ scale: 0.92 }}
              onClick={() => go(s.id)}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ left: `${s.x}%`, top: `${s.y}%` }}
            >
              <div className="relative">
                <Emoji e={s.emoji} size={64} />
                <span className="absolute -bottom-1 -right-3">
                  <Emoji e={c.emoji} size={34} loop={!done[s.id]} />
                </span>
                {!done[s.id] ? (
                  <motion.span
                    animate={{ y: [0, -6, 0] }}
                    transition={{ repeat: Infinity, duration: 0.9 }}
                    className="absolute -top-4 left-1/2 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border-2 border-b-4 border-amber-500 bg-amber-300 text-base font-black text-amber-900"
                  >
                    !
                  </motion.span>
                ) : (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xl">✅</span>
                )}
              </div>
              <span className="mt-1 rounded-full bg-white/90 px-2 py-0.5 text-xs font-black text-slate-700 shadow">{s.label}</span>
            </motion.button>
          );
        })}

        {/* 玩家 */}
        <motion.div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
          animate={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          transition={{ type: 'spring', stiffness: 60, damping: 14 }}
        >
          <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.5 }}>
            <Emoji e="🧑" size={44} />
          </motion.div>
        </motion.div>

        {!allDone && !open && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-sm font-extrabold text-slate-500">
            👆 点一个地方去打听
          </div>
        )}
      </div>

      <Btn className="mt-4" disabled={!allDone} onClick={() => g.talk(round, done)}>
        {allDone ? '都问完了，出发 →' : `还差 ${round.spots.filter((s) => !done[s.id]).length} 个人`}
      </Btn>

      <AnimatePresence>
        {spot && (
          <motion.div className="fixed inset-0 z-40 flex items-end bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 240, damping: 28 }}
              className="mx-auto flex h-[82%] w-full max-w-md flex-col rounded-t-[28px] bg-white px-4 pb-5 pt-3"
            >
              <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-200" />
              <div className="mb-1 flex items-center gap-2 text-sm font-black text-slate-400">
                <Emoji e={spot.emoji} size={24} /> {spot.label}
              </div>
              <div className="min-h-0 flex-1">
                <Dialogue
                  beats={spot.beats}
                  style="chat"
                  partner={spot.who}
                  baseFlags={flags}
                  onDone={(r) => {
                    sfx.fix();
                    setDone((d) => ({ ...d, [spot.id]: r }));
                    setOpen(null);
                    setPos({ x: 50, y: 50 });
                  }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
