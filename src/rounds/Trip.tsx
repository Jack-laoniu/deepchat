import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { Character } from '../chars/Character';
import { GUIDE } from '../chars/library';
import { sfx } from '../fx/fx';
import { useGame } from '../game';
import { getLang, t } from '../i18n';
import type { TripRound } from '../lesson/schema';
import type { Trip as TripT } from '../lesson/trip';
import { Emoji } from '../ui/Emoji';
import { Btn } from '../ui/kit';

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 常见的几种长度：周末、三四天、一周、旅居（两周起） */
const PRESETS = [
  { n: 2, key: 'tripWeekend' },
  { n: 3, key: 'tripShort' },
  { n: 7, key: 'tripWeek' },
  { n: 14, key: 'tripStay' },
] as const;

const today = () => new Date().toISOString().slice(0, 10);

/** 一行：标签 + − 数字 + */
function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const btn = 'h-9 w-9 rounded-xl border-2 border-b-4 border-slate-200 bg-white text-lg font-black text-slate-600 disabled:opacity-30';
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-sm font-black text-slate-500">{label}</span>
      <button className={btn} disabled={value <= min} onClick={() => (sfx.tap(), onChange(value - 1))} aria-label="−">
        −
      </button>
      <motion.span key={value} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className="w-8 text-center text-xl font-black tabular-nums text-slate-700">
        {value}
      </motion.span>
      <button className={btn} disabled={value >= max} onClick={() => (sfx.tap(), onChange(value + 1))} aria-label="+">
        +
      </button>
    </div>
  );
}

/**
 * 文牒登记：一本「通关文牒」，小芳帮你登记哪天到、住几晚、几个人、几间房，最后盖个章。
 * 这几样是订酒店、订票、找导游时的硬条件；日期没定可以只选月份。
 */
export function Trip({ round }: { round: TripRound }) {
  const g = useGame();
  const zh = getLang() === 'zh';
  const [fixed, setFixed] = useState(true);
  const [start, setStart] = useState('');
  const [month, setMonth] = useState<number | null>(null);
  const [nights, setNights] = useState(3);
  const [adults, setAdults] = useState(2);
  const [kids, setKids] = useState(0);
  const [rooms, setRooms] = useState(1);
  const [roomsTouched, setRoomsTouched] = useState(false);
  const [stamped, setStamped] = useState(false);
  // 房间数跟着人数走（两个大人一间），用户自己改过就不动了
  const autoRooms = (a: number) => !roomsTouched && setRooms(Math.max(1, Math.ceil(a / 2)));
  const ready = fixed ? !!start : month !== null;

  const stamp = () => {
    if (!ready || stamped) return;
    setStamped(true);
    sfx.fix();
    const tr: TripT = { ...(fixed ? { start } : { month: month! }), nights, adults, kids, rooms };
    setTimeout(() => g.trip(round, tr), 700);
  };

  const chip = (on: boolean) => `rounded-full border-2 px-3 py-1 text-sm font-black ${on ? 'border-amber-500 bg-amber-400 text-white' : 'border-slate-200 bg-white text-slate-600'}`;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-2">
        <Emoji e={round.emoji} size={28} />
        <h2 className="text-xl font-black text-slate-700">{round.title}</h2>
      </div>
      {round.say && (
        <div className="mb-2 flex items-end gap-2">
          <div className="shrink-0 overflow-hidden rounded-full bg-slate-100">
            <Character id={round.who ?? GUIDE} size={44} bust talking={!stamped} />
          </div>
          <div className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-[15px] font-bold text-slate-700">{round.say}</div>
        </div>
      )}

      {/* 文牒本体 */}
      <div className="relative min-h-0 flex-1 overflow-y-auto rounded-3xl border-2 border-b-[6px] border-amber-700/60 bg-[#FBF3DF] p-3 shadow-inner">
        <div className="space-y-3">
          <section>
            <div className="mb-1.5 text-sm font-black text-amber-900">{t('tripWhen')}</div>
            <div className="mb-2 flex gap-2">
              <button className={chip(fixed)} onClick={() => (sfx.tap(), setFixed(true))}>
                {t('tripFixed')}
              </button>
              <button className={chip(!fixed)} onClick={() => (sfx.tap(), setFixed(false))}>
                {t('tripOpen')}
              </button>
            </div>
            {fixed ? (
              <input
                type="date"
                min={today()}
                value={start}
                onChange={(e) => setStart(e.target.value)}
                aria-label={t('tripPickDate')}
                className="w-full rounded-2xl border-2 border-amber-300 bg-white px-3 py-2 text-[16px] font-black text-slate-700 outline-none focus:border-amber-500"
              />
            ) : (
              <div className="grid grid-cols-6 gap-1.5">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <button key={m} className={`${chip(month === m)} px-0`} onClick={() => (sfx.tap(), setMonth(m))}>
                    {zh ? t('tripMonthN', { n: m }) : MONTHS_EN[m - 1]}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-1.5 flex items-center text-sm font-black text-amber-900">
              {t('tripNights')}
              <span className="ml-auto text-base tabular-nums">{t('tripNightsN', { n: nights })}</span>
            </div>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button key={p.key} className={chip(p.n === 14 ? nights >= 10 : p.n === 3 ? nights === 3 || nights === 4 : nights === p.n)} onClick={() => (sfx.tap(), setNights(p.n))}>
                  {t(p.key)}
                </button>
              ))}
            </div>
            <input type="range" min={1} max={30} value={nights} onChange={(e) => setNights(Number(e.target.value))} className="chunky-range w-full" style={{ ['--p' as string]: `${((nights - 1) / 29) * 100}%` }} />
          </section>

          <section className="space-y-2">
            <div className="text-sm font-black text-amber-900">{t('tripWho')}</div>
            <Stepper
              label={t('tripAdults')}
              value={adults}
              min={1}
              max={12}
              onChange={(v) => {
                setAdults(v);
                autoRooms(v);
              }}
            />
            <Stepper label={t('tripKids')} value={kids} min={0} max={8} onChange={setKids} />
            <Stepper
              label={t('tripRooms')}
              value={rooms}
              min={1}
              max={8}
              onChange={(v) => {
                setRoomsTouched(true);
                setRooms(v);
              }}
            />
          </section>
        </div>

        {/* 盖章 */}
        <AnimatePresence>
          {stamped && (
            <motion.div
              initial={{ scale: 3, opacity: 0, rotate: -30 }}
              animate={{ scale: 1, opacity: 1, rotate: -12 }}
              transition={{ type: 'spring', stiffness: 400, damping: 14 }}
              className="pointer-events-none absolute right-4 top-6 rounded-xl border-4 border-rose-600 px-2 py-1 text-2xl font-black text-rose-600"
            >
              {zh ? '准予通行' : 'APPROVED'}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Btn className="mt-3" disabled={!ready || stamped} onClick={stamp}>
        {t('tripStamp')}
      </Btn>
    </div>
  );
}
