import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Character } from '../chars/Character';
import { GUIDE } from '../chars/library';
import { sfx } from '../fx/fx';
import { playMusic } from '../fx/music';
import { useGame } from '../game';
import { t } from '../i18n';
import { optionDelta, walkBeats, type Material, type ReadAnswer, type Replies } from '../lesson/engine';
import { filledOf, puzzleOf, type Piece } from '../lesson/puzzle';
import type { BossRound } from '../lesson/schema';
import { Emoji } from '../ui/Emoji';
import { Btn, PriceBadge } from '../ui/kit';
import { PuzzleBoard } from '../ui/Puzzle';
import { Dialogue, useCast } from './Talk';

type Step = 'recap' | 'read' | 'clash' | 'pick' | 'probe' | 'bring' | 'done';

/**
 * 终章（boss）：不是打怪，而是把需求说透，补上拼图的最后几块。
 * ① 回顾：已经点亮的拼图 + 用户亲口说的话；② 行业里常见的几种做法（带优缺点），选一个方向；
 * ③ 针对这个方向追问几句；④ 出方案前还需要的资料，逐项点 有 / 没有 / 不确定；拼图补齐，通关。
 * 个性化终章（按用户这一局的回答重写的）在 ② 之前还有两步：「我是这么理解你的」逐条确认 / 纠正，
 * 以及回答里互相打架的地方二选一；② 的每条路都写着为什么适合他。
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
  const [read, setRead] = useState<Record<string, ReadAnswer>>({});
  const [clash, setClash] = useState<Record<string, 'a' | 'b'>>({});
  /** 几条路都不合适：自己说 */
  const [own, setOwn] = useState<string | null>(null);
  const option = round.options.find((o) => o.id === picked);
  // 最适合他的那条排在最前面
  const options = [...round.options].sort((a, b) => Number(!!b.best) - Number(!!a.best));

  // 追问按选的方向出现：在已有标记上加上这个选项设的标记
  const flags = useMemo(() => new Set([...played.flags, ...(option?.set ?? [])]), [played.flags, option]);
  const hasProbe = round.probe.length > 0 && walkBeats(round.probe, {}, flags).visible.length > 0;

  // 回顾里展示的几句：用户亲口说的优先，其次是做过的决定
  const recap = [...played.quotes.map((q) => `「${q.text}」`), ...played.decisions.map((d) => `${d.thing} → ${d.choice}`)].slice(0, 4);
  const filled = new Set<Piece>(before);
  if (step === 'done') piecesOfFinale(round).forEach((p) => filled.add(p));
  else if ((picked || own?.trim()) && step !== 'pick') filled.add('direction');
  const missing = pieces.filter((p) => !filled.has(p));

  const afterRecap = () => (round.read.length ? go('read') : afterRead());
  const afterRead = () => (round.clash.length ? go('clash') : go('pick'));
  const go = (s: Step) => {
    sfx.whoosh();
    setStep(s);
  };
  const afterPick = () => (hasProbe ? go('probe') : round.bring.length ? go('bring') : finish());
  const afterProbe = () => (round.bring.length ? go('bring') : finish());
  const finish = (packed: Record<string, Material['state']> = bring) => {
    if (sent) return;
    setSent(true);
    setStep('done');
    playMusic('home');
    setTimeout(() => g.finale(round, { option: own !== null ? '' : picked!, own: own ?? undefined, replies, bring: packed, read, clash }), 1900);
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
              <Btn className="mt-auto" onClick={afterRecap}>
                {t('next')}
              </Btn>
            </motion.div>
          )}

          {step === 'read' && (
            <motion.div key="read" className="flex h-full flex-col" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}>
              <HostSays host={host} mood="thinking" text={t('finaleRead')} />
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-2">
                {round.read.map((it, i) => {
                  const a = read[it.id];
                  return (
                    <motion.div
                      key={it.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className={`rounded-3xl border-2 p-3 ${a?.ok ? 'border-emerald-300 bg-emerald-50' : a ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}
                    >
                      <div className="flex items-start gap-2">
                        <Emoji e={it.emoji} size={30} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[16px] font-black leading-snug text-slate-700">{it.text}</div>
                          {it.from && (
                            <div className="mt-0.5 text-xs font-bold text-slate-400">💬 {it.from}</div>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() => {
                            sfx.good();
                            setRead((x) => ({ ...x, [it.id]: { ok: true } }));
                          }}
                          className={`rounded-xl border-2 border-b-4 py-1.5 text-sm font-black ${a?.ok ? 'border-emerald-400 bg-emerald-100 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'}`}
                        >
                          👍 {t('finaleReadOk')}
                        </button>
                        <button
                          onClick={() => {
                            sfx.tap();
                            setRead((x) => ({ ...x, [it.id]: { ok: false, text: x[it.id] && !x[it.id].ok ? (x[it.id] as { text?: string }).text : '' } }));
                          }}
                          className={`rounded-xl border-2 border-b-4 py-1.5 text-sm font-black ${a && !a.ok ? 'border-amber-400 bg-amber-100 text-amber-700' : 'border-slate-200 bg-white text-slate-500'}`}
                        >
                          ✏️ {t('finaleReadFix')}
                        </button>
                      </div>
                      {a && !a.ok && (
                        <motion.input
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          autoFocus
                          value={a.text ?? ''}
                          maxLength={80}
                          onChange={(e) => setRead((x) => ({ ...x, [it.id]: { ok: false, text: e.target.value } }))}
                          placeholder={t('finaleReadPlaceholder')}
                          className="mt-2 w-full rounded-xl border-2 border-amber-200 bg-white px-3 py-2 text-[15px] font-bold text-slate-700 outline-none focus:border-amber-400"
                        />
                      )}
                    </motion.div>
                  );
                })}
              </div>
              <Btn disabled={round.read.some((it) => !read[it.id])} onClick={afterRead}>
                {t('next')}
              </Btn>
            </motion.div>
          )}

          {step === 'clash' && (
            <motion.div key="clash" className="flex h-full flex-col" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}>
              <HostSays host={host} mood="thinking" text={t('finaleClash')} />
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-2">
                {round.clash.map((c, i) => (
                  <motion.div key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12 }} className="rounded-3xl bg-slate-50 p-3">
                    <div className="mb-2 flex items-center justify-center gap-2 text-center text-[16px] font-black text-slate-600">
                      <Emoji e={c.emoji} size={24} /> {c.q}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(['a', 'b'] as const).map((side) => {
                        const o = c[side];
                        const on = clash[c.id] === side;
                        const delta = optionDelta(played.cart, o);
                        return (
                          <motion.button
                            key={side}
                            animate={{ scale: on ? 1.04 : 1 }}
                            onClick={() => {
                              sfx.tap();
                              setClash((x) => ({ ...x, [c.id]: side }));
                            }}
                            className={`relative flex flex-col items-center gap-1 rounded-2xl border-2 border-b-[5px] px-2 py-3 ${on ? 'border-violet-500 bg-violet-50' : 'border-slate-200 bg-white'}`}
                          >
                            <Emoji e={o.emoji} size={40} />
                            <span className="text-[15px] font-black leading-tight text-slate-700">{o.label}</span>
                            {delta !== 0 && <PriceBadge delta={delta} />}
                          </motion.button>
                        );
                      })}
                    </div>
                  </motion.div>
                ))}
              </div>
              <Btn disabled={round.clash.some((c) => !clash[c.id])} onClick={() => go('pick')}>
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
                <div className="text-[15px] font-black text-slate-600">{t(round.read.length ? 'finalePickYou' : 'finalePick')}</div>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-2">
                {options.map((o, i) => {
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
                        setOwn(null);
                      }}
                      className={`relative flex w-full items-start gap-3 rounded-3xl border-2 border-b-[5px] p-3 text-left ${on ? 'border-violet-500 bg-violet-50' : 'border-slate-200 bg-white'}`}
                    >
                      <Emoji e={o.emoji} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-lg font-black text-slate-700">{o.label}</span>
                          {o.best && <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[11px] font-black text-white">{t('finaleBest')}</span>}
                        </div>
                        {o.why && <div className="text-sm font-black text-violet-600">💡 {o.why}</div>}
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
                {own === null ? (
                  <button
                    onClick={() => {
                      sfx.tap();
                      setPicked(null);
                      setOwn('');
                    }}
                    className="w-full rounded-2xl border-2 border-dashed border-sky-300 py-2.5 text-[16px] font-extrabold text-sky-600"
                  >
                    {t('sayOwn')}
                  </button>
                ) : (
                  <input
                    autoFocus
                    value={own}
                    maxLength={120}
                    onChange={(e) => setOwn(e.target.value)}
                    placeholder={t('ownPh')}
                    className="w-full rounded-2xl border-2 border-sky-300 bg-white px-4 py-3 text-[17px] font-bold text-slate-700 outline-none focus:border-sky-500"
                  />
                )}
                {round.gamble && (
                  <button onClick={() => g.gamble(round)} className="w-full rounded-2xl border-2 border-dashed border-slate-300 py-2 text-sm font-black text-slate-400">
                    {round.gamble.emoji} {round.gamble.label || t('finaleGamble')}
                  </button>
                )}
              </div>
              <Btn disabled={!picked && !own?.trim()} onClick={afterPick}>
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
              {/* 已经有的、已经订好的点一下；没点的就是还没搞定（交给 AI 和导游时就是机会） */}
              <div className="mb-2 flex items-center justify-center gap-2">
                <motion.div key={round.bring.filter((b) => bring[b.id] === 'have').length} animate={{ scale: [1, 1.18, 1], rotate: [0, -6, 6, 0] }} transition={{ duration: 0.35 }}>
                  <Emoji e="📋" size={48} />
                </motion.div>
                <div className="text-sm font-black text-slate-500">{t('packHint')}</div>
              </div>
              <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-y-auto pb-2">
                {round.bring.map((b, i) => {
                  const packed = bring[b.id] === 'have';
                  return (
                    <motion.button
                      key={b.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0, scale: packed ? 0.96 : 1 }}
                      transition={{ delay: i * 0.06 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => {
                        sfx.tap();
                        setBring((x) => ({ ...x, [b.id]: packed ? 'no' : 'have' }));
                      }}
                      className={`relative flex flex-col items-center gap-1 rounded-3xl border-2 border-b-4 p-3 ${packed ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'}`}
                    >
                      <Emoji e={b.emoji} size={36} />
                      <span className={`text-center text-sm font-black leading-tight ${packed ? 'text-emerald-700' : 'text-slate-600'}`}>{b.label}</span>
                      {packed && <span className="absolute right-2 top-2 text-sm">✅</span>}
                    </motion.button>
                  );
                })}
              </div>
              <Btn
                onClick={() => {
                  // 没点的 = 还没有 / 还没订
                  const packed = Object.fromEntries(round.bring.map((b) => [b.id, bring[b.id] === 'have' ? 'have' : 'no'] as const));
                  setBring(packed);
                  finish(packed);
                }}
              >
                {round.bring.every((b) => bring[b.id] === 'have') ? t('packAll') : t('packDone', { n: round.bring.filter((b) => bring[b.id] !== 'have').length })}
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

/** 主持人头像 + 一句话 */
function HostSays({ host, mood, text }: { host: string; mood: 'thinking' | 'happy' | 'neutral'; text: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <div className="overflow-hidden rounded-xl bg-violet-50">
        <Character id={host} size={40} bust mood={mood} />
      </div>
      <div className="text-[15px] font-black text-slate-600">{text}</div>
    </div>
  );
}

const piecesOfFinale = (r: BossRound): Piece[] => (r.bring.length ? ['direction', 'data'] : ['direction']);

/**
 * 用户走到终章时，按他的回答重写的终章还没生成好：拼图转一转等一会儿。
 * 8 秒后可以点「不等了」；30 秒还没好就自动用原来的终章。
 */
export function FinaleWait({ round }: { round: BossRound }) {
  const g = useGame();
  const [canSkip, setCanSkip] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setCanSkip(true), 8000);
    const b = setTimeout(() => g.skipFinaleWait(), 30_000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
      <span className="rounded-full bg-violet-600 px-3 py-1 text-xs font-black tracking-widest text-white">{t('finaleTag')}</span>
      <div className="relative">
        <div className="overflow-hidden rounded-3xl bg-violet-50">
          <Character id={round.who ?? GUIDE} size={120} bust mood="thinking" />
        </div>
        <motion.div className="absolute -right-4 -top-4" animate={{ rotate: [0, 360] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}>
          <Emoji e="🧩" size={44} />
        </motion.div>
      </div>
      <div className="max-w-[18rem] text-lg font-black text-slate-600">{t('finaleWait')}</div>
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="h-2.5 w-2.5 rounded-full bg-violet-400" animate={{ y: [0, -8, 0] }} transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }} />
        ))}
      </div>
      <AnimatePresence>
        {canSkip && (
          <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={g.skipFinaleWait} className="text-sm font-black text-slate-400">
            {t('finaleWaitSkip')}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * 用户开场用自己的话说了最想干啥，按原话现写的新场景还没好：小芳在画地图。
 * 8 秒后可以点「先逛现成的」；45 秒还没好就自动用占位的场景。
 */
export function SceneWait({ goal }: { goal: string }) {
  const g = useGame();
  const [canSkip, setCanSkip] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setCanSkip(true), 8000);
    const b = setTimeout(() => g.skipSceneWait(), 45_000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
      <div className="relative">
        <div className="overflow-hidden rounded-3xl bg-sky-50">
          <Character id={GUIDE} size={120} bust mood="thinking" />
        </div>
        <motion.div className="absolute -right-4 -top-4" animate={{ rotate: [-12, 12, -12] }} transition={{ duration: 1.2, repeat: Infinity }}>
          <Emoji e="🗺️" size={44} />
        </motion.div>
      </div>
      <div className="max-w-[18rem] text-lg font-black text-slate-600">{t('sceneWait', { goal: goal.slice(0, 24) })}</div>
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="h-2.5 w-2.5 rounded-full bg-sky-400" animate={{ y: [0, -8, 0] }} transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }} />
        ))}
      </div>
      <AnimatePresence>
        {canSkip && (
          <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={g.skipSceneWait} className="text-sm font-black text-slate-400">
            {t('sceneWaitSkip')}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
