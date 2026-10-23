import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Character } from '../chars/Character';
import { GUIDE } from '../chars/library';
import { sfx } from '../fx/fx';
import { playMusic } from '../fx/music';
import { useGame } from '../game';
import { t } from '../i18n';
import { optionDelta, walkBeats, type Material, type Replies } from '../lesson/engine';
import { filledOf, puzzleOf, type Piece } from '../lesson/puzzle';
import type { BossRound } from '../lesson/schema';
import { Emoji } from '../ui/Emoji';
import { Btn, PriceBadge } from '../ui/kit';
import { PuzzleBoard } from '../ui/Puzzle';
import { Dialogue, useCast } from './Talk';

type Step = 'recap' | 'pick' | 'probe' | 'bring' | 'done';

/**
 * 终章（boss）：不是打怪，而是把需求说透，补上拼图的最后几块。
 * ① 回顾：已经点亮的拼图 + 用户亲口说的话；② 行业里常见的几种做法（带优缺点），选一个方向；
 * ③ 针对这个方向追问几句；④ 出方案前还需要的资料，逐项点 有 / 没有 / 不确定；拼图补齐，通关。
 */
export function Finale({ round }: { round: BossRound }) {
  const g = useGame();
  const who = useCast();
  const played = g.played!;
  const lesson = g.lesson!;
  const host = round.who ?? GUIDE;
  const pieces = puzzleOf(lesson, played);
  const before = useMemo(() => filledOf(lesson, played), [lesson, played]);
  const [step, setStep] = useState<Step>('recap');
  const [picked, setPicked] = useState<string | null>(null);
  const [replies, setReplies] = useState<Replies>({});
  const [bring, setBring] = useState<Record<string, Material['state']>>({});
  const [sent, setSent] = useState(false);
  const option = round.options.find((o) => o.id === picked);

  // 追问按选的方向出现：在已有标记上加上这个选项设的标记
  const flags = useMemo(() => new Set([...played.flags, ...(option?.set ?? [])]), [played.flags, option]);
  const hasProbe = round.probe.length > 0 && walkBeats(round.probe, {}, flags).visible.length > 0;

  // 回顾里展示的几句：用户亲口说的优先，其次是做过的决定
  const recap = [...played.quotes.map((q) => `「${q.text}」`), ...played.decisions.map((d) => `${d.thing} → ${d.choice}`)].slice(0, 4);
  const filled = new Set<Piece>(before);
  if (step === 'done') piecesOfFinale(round).forEach((p) => filled.add(p));
  else if (picked && step !== 'pick') filled.add('direction');
  const missing = pieces.filter((p) => !filled.has(p));

  const go = (s: Step) => {
    sfx.whoosh();
    setStep(s);
  };
  const afterPick = () => (hasProbe ? go('probe') : round.bring.length ? go('bring') : finish());
  const afterProbe = () => (round.bring.length ? go('bring') : finish());
  const finish = () => {
    if (sent) return;
    setSent(true);
    setStep('done');
    playMusic('home');
    setTimeout(() => g.finale(round, { option: picked!, replies, bring }), 1900);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="text-center">
        <span className="rounded-full bg-violet-600 px-3 py-1 text-xs font-black tracking-widest text-white">{t('finaleTag')}</span>
        <h2 className="mt-2 text-[24px] font-black leading-tight text-slate-700">{round.q}</h2>
        {round.problem && <div className="mt-1 text-sm font-black text-slate-400">{round.problem}</div>}
      </div>

      <div className="relative mt-2 min-h-0 flex-1">
        <AnimatePresence mode="wait">
          {step === 'recap' && (
            <motion.div key="recap" className="flex h-full flex-col" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}>
              <div className="flex items-end gap-2">
                <div className="overflow-hidden rounded-2xl bg-violet-50">
                  <Character id={host} size={72} bust mood="happy" talking />
                </div>
                <div className="mb-2 rounded-2xl rounded-bl-sm border-2 border-violet-100 bg-white px-3 py-2 text-[15px] font-extrabold text-slate-700 shadow-sm">{t('finaleRecap')}</div>
              </div>
              <div className="mt-3 rounded-3xl bg-gradient-to-b from-violet-50 to-white p-3">
                <PuzzleBoard pieces={pieces} filled={before} />
              </div>
              <div className="mt-3 space-y-1.5">
                {recap.map((r, i) => (
                  <motion.div
                    key={r}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.15 }}
                    className="truncate rounded-xl bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-600"
                  >
                    ✅ {r}
                  </motion.div>
                ))}
              </div>
              {missing.length > 0 && <div className="mt-3 text-center text-sm font-black text-violet-600">{t('finaleMissing', { n: missing.length })}</div>}
              <Btn className="mt-auto" onClick={() => go('pick')}>
                {t('next')}
              </Btn>
            </motion.div>
          )}

          {step === 'pick' && (
            <motion.div key="pick" className="flex h-full flex-col" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}>
              <div className="mb-2 flex items-center gap-2">
                <div className="overflow-hidden rounded-xl bg-violet-50">
                  <Character id={host} size={40} bust mood="thinking" />
                </div>
                <div className="text-[15px] font-black text-slate-600">{t('finalePick')}</div>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-2">
                {round.options.map((o, i) => {
                  const on = picked === o.id;
                  const delta = optionDelta(played.cart, o);
                  return (
                    <motion.button
                      key={o.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0, scale: on ? 1.02 : 1 }}
                      transition={{ delay: i * 0.08 }}
                      onClick={() => {
                        sfx.tap();
                        setPicked(o.id);
                      }}
                      className={`relative flex w-full items-start gap-3 rounded-3xl border-2 border-b-[5px] p-3 text-left ${on ? 'border-violet-500 bg-violet-50' : 'border-slate-200 bg-white'}`}
                    >
                      <Emoji e={o.emoji} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="text-lg font-black text-slate-700">{o.label}</div>
                        {o.pros && <div className="text-sm font-bold text-emerald-600">👍 {o.pros}</div>}
                        {o.cons && <div className="text-sm font-bold text-rose-500">👎 {o.cons}</div>}
                        {!o.pros && !o.cons && o.tip && <div className="text-sm font-bold text-slate-400">{o.tip}</div>}
                      </div>
                      {delta !== 0 && (
                        <span className="absolute right-2 top-2">
                          <PriceBadge delta={delta} />
                        </span>
                      )}
                    </motion.button>
                  );
                })}
                {round.gamble && (
                  <button onClick={() => g.gamble(round)} className="w-full rounded-2xl border-2 border-dashed border-slate-300 py-2 text-sm font-black text-slate-400">
                    {round.gamble.emoji} {round.gamble.label || t('finaleGamble')}
                  </button>
                )}
              </div>
              <Btn disabled={!picked} onClick={afterPick}>
                {t('finaleGo')}
              </Btn>
            </motion.div>
          )}

          {step === 'probe' && (
            <motion.div key="probe" className="flex h-full flex-col" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}>
              <div className="mb-1 text-center text-sm font-black text-violet-600">
                {option && <Emoji e={option.emoji} size={18} />} {t('finaleProbe')}
              </div>
              <div className="min-h-0 flex-1">
                <Dialogue
                  beats={round.probe}
                  style="chat"
                  partner={host}
                  baseFlags={flags}
                  onDone={(r) => {
                    setReplies(r);
                    afterProbe();
                  }}
                />
              </div>
            </motion.div>
          )}

          {step === 'bring' && (
            <motion.div key="bring" className="flex h-full flex-col" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}>
              <div className="mb-2 flex items-center gap-2">
                <div className="overflow-hidden rounded-xl bg-violet-50">
                  <Character id={host} size={40} bust mood="neutral" />
                </div>
                <div className="text-[15px] font-black text-slate-600">{t('finaleBring')}</div>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-2">
                {round.bring.map((b, i) => (
                  <motion.div key={b.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="rounded-3xl border-2 border-slate-200 bg-white p-2.5">
                    <div className="flex items-center gap-2">
                      <Emoji e={b.emoji} size={32} />
                      <span className="text-base font-black text-slate-700">{b.label}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                      {(
                        [
                          ['have', '✅', t('finaleHave'), 'border-emerald-400 bg-emerald-50 text-emerald-700'],
                          ['no', '❌', t('finaleNo'), 'border-rose-300 bg-rose-50 text-rose-600'],
                          ['unsure', '🤷', t('finaleUnsure'), 'border-amber-300 bg-amber-50 text-amber-700'],
                        ] as const
                      ).map(([st, e, label, on]) => (
                        <button
                          key={st}
                          onClick={() => {
                            sfx.tap();
                            setBring((x) => ({ ...x, [b.id]: st }));
                          }}
                          className={`rounded-xl border-2 border-b-4 py-1.5 text-sm font-black ${bring[b.id] === st ? on : 'border-slate-200 bg-white text-slate-400'}`}
                        >
                          {e} {label}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                ))}
              </div>
              <Btn disabled={round.bring.some((b) => !bring[b.id])} onClick={finish}>
                {t('confirm')}
              </Btn>
            </motion.div>
          )}

          {step === 'done' && (
            <motion.div key="done" className="flex h-full flex-col items-center justify-center gap-4" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
              <motion.div animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.15, 1] }} transition={{ duration: 0.8, delay: 1 }}>
                <Emoji e="🧩" size={72} />
              </motion.div>
              <div className="text-2xl font-black text-violet-600">{t('finaleDone')}</div>
              <PuzzleBoard pieces={pieces} filled={filled} just={piecesOfFinale(round).filter((p) => !before.has(p))} />
              <div className="text-sm font-black text-slate-400">{who(host).as ?? who(host).name}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

const piecesOfFinale = (r: BossRound): Piece[] => (r.bring.length ? ['direction', 'data'] : ['direction']);
