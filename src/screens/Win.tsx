import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../game';
import { celebrate } from '../fx/fx';
import { jingle, playMusic } from '../fx/music';
import { hostFollowUp, inHost } from '../host';
import { superPrompt, yuan } from '../lesson/output';
import { remember } from '../memory';
import { CHAT_AT, earn, friends } from '../bond';
import { Character } from '../chars/Character';
import { charById } from '../chars/library';
import type { Played } from '../lesson/engine';
import type { Lesson } from '../lesson/schema';
import { Hearts } from '../ui/Hearts';
import { FriendChat } from './FriendChat';
import { filledOf, puzzleOf } from '../lesson/puzzle';
import { PuzzleBoard } from '../ui/Puzzle';
import { Emoji } from '../ui/Emoji';
import { Btn, Mascot } from '../ui/kit';
import { copyText } from '../ui/copy';
import { getLang, t } from '../i18n';
import { type Turn } from './Discuss';
import { NextStep } from './NextStep';
import { ShareSheet } from './ShareSheet';

/** 每一局只记一次交情（开发模式下 effect / 初始化会跑两次） */
const earned = new WeakMap<object, ReturnType<typeof earn>>();
function earnOnce(l: Lesson, p: Played, guest: string | null) {
  if (!earned.has(p)) earned.set(p, earn(l, p, guest));
  return earned.get(p)!;
}

function Ring({ value, emoji, label, delay }: { value: number; emoji: string; label: string; delay: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const color = value >= 70 ? '#22c55e' : value >= 40 ? '#f59e0b' : '#f43f5e';
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-20 w-20">
        <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
          <circle cx="36" cy="36" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
          <motion.circle
            cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - value / 100) }}
            transition={{ delay, duration: 1, ease: 'easeOut' }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center">
          <Emoji e={emoji} size={34} />
        </span>
      </div>
      <span className="mt-1 text-sm font-black text-slate-600">{label}</span>
    </div>
  );
}

export function Win() {
  const g = useGame();
  const l = g.lesson!;
  const p = g.played!;
  const [copied, setCopied] = useState(false);
  const [showList, setShowList] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const plan = useMemo(() => superPrompt(l, p, g.crashes), [l, p, g.crashes]);
  // 交给 AI 的方案里带上结算后聊出来的补充信息
  const text = useMemo(
    () => (turns.length ? `${plan}\n\n## ${t('discussLog')}\n${turns.map((m) => `${m.role === 'user' ? (getLang() === 'zh' ? '我：' : 'Me: ') : 'AI: '}${m.content}`).join('\n')}` : plan),
    [plan, turns],
  );
  const guessTotal = l.guess.items.reduce((s, i) => s + i.price, 0);
  const saved = guessTotal - p.total;

  // 记住这一局：下次生成新关卡时，角色会记得用户的情况；和一起闯关的角色交情涨了
  useEffect(() => remember(l, p), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [bonds] = useState(() => earnOnce(l, p, g.guest));
  const [chatWith, setChatWith] = useState<string | null>(null);

  useEffect(() => {
    celebrate();
    // 通关：先停下背景音乐放胜利号角，再回到轻快的首页曲
    playMusic(null);
    jingle.win();
    const id = setTimeout(() => playMusic('home'), 2600);
    return () => clearTimeout(id);
  }, []);

  const [sharing, setSharing] = useState(false);

  const handoff = async () => {
    if (inHost()) await hostFollowUp(text);
    else if (await copyText(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto px-5 pb-6 pt-8">
      <div className="flex flex-col items-center">
        <Mascot mood="party" size={110} />
        <motion.h1 initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }} className="mt-2 text-4xl font-black text-green-500">
          {t('win')}
        </motion.h1>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border-2 border-b-4 border-slate-200 bg-white p-3 text-center">
          <div className="text-xs font-black text-slate-400">{t('guessLabel')}</div>
          <div className="text-xl font-black text-slate-400 line-through decoration-2">{yuan(guessTotal)}</div>
        </div>
        <div className={`rounded-2xl border-2 border-b-4 p-3 text-center ${saved >= 0 ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'}`}>
          <div className={`text-xs font-black ${saved >= 0 ? 'text-green-600' : 'text-amber-600'}`}>
            {saved >= 0 ? t('saved', { x: yuan(saved) }) : t('more', { x: yuan(-saved) })}
          </div>
          <div className="text-xl font-black text-slate-700">{yuan(p.total)}</div>
        </div>
      </div>

      <div className="mt-5 flex justify-around">
        <Ring value={p.score.easy} emoji="😌" label={t('easy')} delay={0.3} />
        <Ring value={p.score.good} emoji="🎯" label={t('good')} delay={0.5} />
        <Ring value={p.score.safe} emoji="🛡️" label={t('safe')} delay={0.7} />
      </div>

      <div className="mt-5 rounded-3xl bg-gradient-to-b from-violet-50 to-white p-3">
        <div className="mb-2 text-center text-sm font-black text-violet-600">🧩 {t('puzzleTitle')}</div>
        <PuzzleBoard pieces={puzzleOf(l, p)} filled={filledOf(l, p)} size="sm" />
      </div>

      {bonds.length > 0 && (
        <div className="mt-4 rounded-3xl bg-gradient-to-b from-rose-50 to-white p-3">
          <div className="mb-2 text-center text-sm font-black text-rose-500">❤️ {t('bondTitle')}</div>
          <div className="flex flex-wrap justify-center gap-2">
            {bonds.map((b, i) => (
              <motion.button
                key={b.id}
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 + i * 0.1 }}
                onClick={() => b.after >= CHAT_AT && setChatWith(b.id)}
                className="flex w-[72px] flex-col items-center rounded-2xl bg-white pb-1 shadow-sm"
              >
                <Character id={b.id} size={52} bust mood={b.after > b.before ? 'happy' : 'neutral'} />
                <Hearts n={b.after} size={8} pop={b.after - b.before} />
                <span className="text-[10px] font-black text-rose-400">+{b.gain}</span>
              </motion.button>
            ))}
          </div>
          {/* 交情够了的熟人（不管这一关有没有出场）：请他从自己的角度看看这个需求 */}
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            {friends()
              .filter((f) => f.hearts >= CHAT_AT)
              .slice(0, 3)
              .map((f) => (
                <button key={f.id} onClick={() => setChatWith(f.id)} className="rounded-full border-2 border-b-4 border-rose-200 bg-white px-3 py-1 text-xs font-black text-rose-600">
                  💬 {t('bondAsk', { name: charById(f.id)!.name[getLang()] })}
                </button>
              ))}
          </div>
        </div>
      )}

      <button onClick={() => setShowList(true)} className="mt-5 flex flex-wrap justify-center gap-2">
        {p.cart.map((it, i) => (
          <motion.span key={it.id} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.8 + i * 0.08 }}>
            <Emoji e={it.emoji} size={40} />
          </motion.span>
        ))}
      </button>
      {(p.risks.length > 0 || g.crashes.length > 0) && (
        <div className="mt-2 flex justify-center gap-2 text-sm font-black">
          {p.risks.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">{t('risks', { n: p.risks.length })}</span>}
          {g.crashes.length > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-600">{t('dodged', { n: g.crashes.length })}</span>}
        </div>
      )}

      {p.quotes.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-sm font-black text-slate-400">{t('yourWords')}</div>
          {p.quotes.map((q, i) => (
            <motion.div
              key={i}
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 1 + i * 0.15 }}
              className="flex justify-end"
            >
              <span className="max-w-[85%] rounded-2xl bg-green-500 px-3 py-1.5 text-[15px] font-bold text-white">{q.text}</span>
            </motion.div>
          ))}
        </div>
      )}

      {l.secret && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-sky-50 p-3">
          <Emoji e="💡" size={36} loop />
          <span className="text-sm font-extrabold text-sky-700">{l.secret}</span>
        </div>
      )}

      <NextStep plan={plan} text={text} turns={turns} setTurns={setTurns} />

      <div className="mt-auto space-y-3 pt-5">
        {/* 定位：我们只把需求问清楚，方案交给用户自己常用的 AI */}
        <div className="rounded-2xl border-2 border-green-200 bg-green-50 p-3">
          <div className="text-base font-black text-green-700">{t('handoffTitle')}</div>
          <div className="mt-1 text-[13px] font-bold leading-snug text-green-700/80">{t('handoffNote')}</div>
        </div>
        <Btn onClick={handoff}>{inHost() ? t('handoffHost') : copied ? t('handoffCopied') : t('handoffCopy')}</Btn>
        <Btn tone="amber" onClick={() => setSharing(true)}>{t('shareBtn')}</Btn>
        <div className="grid grid-cols-2 gap-3">
          <Btn tone="white" onClick={() => setShowList(true)}>{t('list')}</Btn>
          <Btn tone="white" onClick={() => g.open(l)}>{t('replay')}</Btn>
        </div>
      </div>
      <AnimatePresence>
        {showList && (
          <motion.div
            key="sheet"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowList(false)}
            className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40"
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[75%] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white pb-6"
            >
              <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
                <span className="text-lg font-black text-slate-700">{t('list')}</span>
                <span className="text-lg font-black tabular-nums text-slate-700">{yuan(p.total)}</span>
              </div>
              {p.cart.map((it) => (
                <div key={it.id} className="flex items-center gap-2 border-b border-slate-100 px-4 py-2">
                  <Emoji e={it.emoji} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-extrabold text-slate-700">{it.name}</div>
                    {it.spec && <div className="truncate text-xs text-slate-400">{it.spec}</div>}
                  </div>
                  <div className="text-sm font-black tabular-nums text-slate-600">
                    {yuan(it.price)}
                    {!it.source && <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] text-slate-400">{t('est')}</span>}
                  </div>
                </div>
              ))}
              {p.extras.map((e, i) => (
                <div key={i} className="flex justify-between border-b border-slate-100 px-4 py-2 text-sm text-slate-500">
                  <span>{t('adjust')}{e.label}</span>
                  <span className="font-black tabular-nums">{e.price > 0 ? '+' : ''}{yuan(e.price)}</span>
                </div>
              ))}
              <div className="px-4 pt-4">
                <Btn tone="white" onClick={() => setShowList(false)}>{t('hideList')}</Btn>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{sharing && <ShareSheet onClose={() => setSharing(false)} />}</AnimatePresence>
      <AnimatePresence>{chatWith && <FriendChat id={chatWith} plan={plan} onClose={() => setChatWith(null)} />}</AnimatePresence>
    </div>
  );
}
