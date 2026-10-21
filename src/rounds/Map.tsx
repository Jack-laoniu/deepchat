import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Character, type Act } from '../chars/Character';
import { sfx } from '../fx/fx';
import { useGame } from '../game';
import { t } from '../i18n';
import { walkBeats, type Replies } from '../lesson/engine';
import type { MapRound } from '../lesson/schema';
import { Emoji } from '../ui/Emoji';
import { Btn } from '../ui/kit';
import { Dialogue, useCast } from './Talk';

type Pt = { x: number; y: number };
const DECOR = [
  { e: '🌳', x: 7, y: 12 }, { e: '🌲', x: 92, y: 16 }, { e: '🌼', x: 28, y: 90 }, { e: '🌳', x: 72, y: 93 },
  { e: '🪨', x: 52, y: 7 }, { e: '🌷', x: 5, y: 58 }, { e: '🌲', x: 95, y: 66 }, { e: '🌻', x: 40, y: 52 },
];
/** 地图上走一个百分点要多少秒 */
const PACE = 0.045;

/** 会自己溜达的 NPC：在自己的地点附近来回走，玩家走近时转身挥手 */
function Npc({ id, home, greeting, done }: { id: string; home: Pt; greeting: boolean; done: boolean }) {
  // 站在建筑朝地图中间的那一侧，不挡住地点名字
  const side = home.x > 50 ? -13 : 13;
  const [pos, setPos] = useState<Pt>({ x: home.x + side, y: home.y + 8 });
  const [act, setAct] = useState<Act>('idle');
  const [facing, setFacing] = useState<'left' | 'right'>('left');
  const [dur, setDur] = useState(0.3);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (greeting) {
      setAct('wave');
      setFacing(pos.x > 50 ? 'left' : 'right');
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const wander = () => {
      timer = setTimeout(() => {
        if (!alive.current) return;
        const target = { x: home.x + side + (Math.random() * 8 - 4) * Math.sign(side), y: home.y + 6 + Math.random() * 6 };
        setPos((p) => {
          const d = Math.hypot(target.x - p.x, target.y - p.y);
          setFacing(target.x < p.x ? 'left' : 'right');
          setDur(d * PACE);
          setAct('walk');
          setTimeout(() => alive.current && setAct('idle'), d * PACE * 1000);
          return target;
        });
        wander();
      }, 1800 + Math.random() * 2600);
    };
    wander();
    return () => {
      alive.current = false;
      clearTimeout(timer);
    };
  }, [greeting, home.x, home.y]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      className="pointer-events-none absolute -translate-x-1/2 -translate-y-full"
      animate={{ left: `${pos.x}%`, top: `${pos.y}%` }}
      transition={{ duration: dur, ease: 'linear' }}
      style={{ zIndex: Math.round(pos.y) }}
    >
      <Character id={id} size={46} act={act} facing={facing} mood={done ? 'happy' : greeting ? 'happy' : 'neutral'} />
    </motion.div>
  );
}

/** 地图关：点地点，自己的小人走过去，和那里的人聊完打勾；全部聊完才能出发 */
export function MapQuest({ round }: { round: MapRound }) {
  const g = useGame();
  const who = useCast();
  const [done, setDone] = useState<Record<string, Replies>>({});
  const [me, setMe] = useState<Pt>({ x: 50, y: 58 });
  const [walking, setWalking] = useState(false);
  const [walkDur, setWalkDur] = useState(0.3);
  const [facing, setFacing] = useState<'left' | 'right'>('right');
  const [target, setTarget] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const spot = round.spots.find((s) => s.id === open);
  const allDone = round.spots.every((s) => done[s.id]);

  const flags = useMemo(() => {
    let f = g.played!.flags;
    for (const s of round.spots) if (done[s.id]) f = walkBeats(s.beats, done[s.id], f).flags;
    return f;
  }, [done, g.played, round.spots]);

  const go = (id: string) => {
    const s = round.spots.find((x) => x.id === id)!;
    if (done[id] || walking || open) return;
    const dest = { x: s.x + (s.x > 50 ? -16 : 16), y: s.y + 22 };
    const dist = Math.hypot(dest.x - me.x, dest.y - me.y);
    sfx.whoosh();
    setTarget(id);
    setFacing(dest.x < me.x ? 'left' : 'right');
    setWalking(true);
    setWalkDur(dist * PACE);
    setMe(dest);
    setTimeout(() => {
      setWalking(false);
      setFacing(s.x < dest.x ? 'left' : 'right');
      setTimeout(() => setOpen(id), 450);
    }, dist * PACE * 1000);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-2">
        <Emoji e={round.emoji} size={36} loop />
        <h2 className="text-2xl font-black text-slate-700">{round.title}</h2>
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        {round.spots.map((s) => (
          <span key={s.id} className={`rounded-full px-2.5 py-1 text-xs font-black ${done[s.id] ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            {done[s.id] ? '✅' : '⬜'} {t('find', { name: who(s.who).as ?? who(s.who).name })}
          </span>
        ))}
      </div>

      <div className="relative flex-1 overflow-hidden rounded-[28px] border-2 border-b-[6px] border-green-300 bg-gradient-to-b from-lime-200 via-green-200 to-emerald-300">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {round.spots.map((s) => (
            <path key={s.id} d={`M 50 62 Q ${(50 + s.x) / 2} ${s.y + 26} ${s.x} ${s.y + 14}`} fill="none" stroke="#fef3c7" strokeWidth="4" strokeLinecap="round" />
          ))}
        </svg>
        {DECOR.map((d, i) => (
          <span key={i} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${d.x}%`, top: `${d.y}%` }}>
            <Emoji e={d.e} size={28} />
          </span>
        ))}

        {round.spots.map((s) => (
          <button
            key={s.id}
            onClick={() => go(s.id)}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${s.x}%`, top: `${s.y}%`, zIndex: 1 }}
          >
            <div className="relative">
              <Emoji e={s.emoji} size={60} />
              {!done[s.id] ? (
                <motion.span
                  animate={{ y: [0, -6, 0] }}
                  transition={{ repeat: Infinity, duration: 0.9 }}
                  className="absolute -right-2 -top-3 flex h-7 w-7 items-center justify-center rounded-full border-2 border-b-4 border-amber-500 bg-amber-300 text-base font-black text-amber-900"
                >
                  !
                </motion.span>
              ) : (
                <span className="absolute -right-2 -top-3 text-xl">✅</span>
              )}
            </div>
            <span className="mt-0.5 rounded-full bg-white/90 px-2 py-0.5 text-xs font-black text-slate-700 shadow">{s.label}</span>
          </button>
        ))}

        {round.spots.map((s) => (
          <Npc key={s.id} id={s.who} home={{ x: s.x, y: s.y }} greeting={target === s.id && !walking && !done[s.id]} done={!!done[s.id]} />
        ))}

        <motion.div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full"
          animate={{ left: `${me.x}%`, top: `${me.y}%` }}
          transition={{ duration: walkDur, ease: 'linear' }}
          style={{ zIndex: Math.round(me.y) + 1 }}
        >
          <Character id="me" size={52} act={walking ? 'walk' : allDone ? 'jump' : 'idle'} facing={facing} mood={allDone ? 'happy' : 'neutral'} />
        </motion.div>

        {!allDone && !open && !walking && (
          <div className="absolute bottom-3 left-1/2 z-[200] -translate-x-1/2 whitespace-nowrap rounded-full bg-white/90 px-3 py-1 text-sm font-extrabold text-slate-500">
            {t('tapToGo')}
          </div>
        )}
      </div>

      <Btn className="mt-3" disabled={!allDone} onClick={() => g.talk(round, done)}>
        {allDone ? t('allAsked') : t('missing', { n: round.spots.filter((s) => !done[s.id]).length })}
      </Btn>

      <AnimatePresence>
        {spot && (
          <motion.div className="fixed inset-0 z-[300] flex items-end bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 240, damping: 28 }}
              className="mx-auto flex h-[86%] w-full max-w-md flex-col rounded-t-[28px] bg-white px-4 pb-5 pt-3"
            >
              <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-200" />
              <div className="mb-1 flex items-center gap-2 text-sm font-black text-slate-400">
                <Emoji e={spot.emoji} size={22} /> {spot.label}
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
                    setTarget(null);
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
