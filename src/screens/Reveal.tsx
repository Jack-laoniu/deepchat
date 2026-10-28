import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { uploadVoice, useCanGenerate } from '../api';
import { sfx } from '../fx/fx';
import { canRecord, useRecorder } from '../fx/recorder';
import { useGame, type ShareCtx } from '../game';
import { t } from '../i18n';
import { picksOf, type Pick } from '../lesson/picks';
import type { Round } from '../lesson/schema';
import { FriendBadge, playVoice } from './FriendVoice';

/**
 * 朋友玩分享过来的关：每一步自己先选，选完马上看到分享的人在这一步选了什么。
 * 选得不一样（参谋则每一步）就地吐槽一句：按住说、或者打字；参谋还能点「好选择 / 再想想」。
 * 先选后看：朋友的选择不被带偏，对比本身就是笑点。
 */

/** 对话里的一个提问：按提问 id 和问题原文对上分享的人的那个选择（同一个 id 可能在不同回合出现） */
export function sharerPickFor(share: ShareCtx | null, ask: { id: string; q: string }): Pick | undefined {
  return share?.picks.find((p) => p.key.split('.').pop() === ask.id && p.q === ask.q);
}

/** 一条揭晓：TA 选了什么、和你一不一样、吐槽 / 好不好 */
export function RevealRow({ sharer, mine }: { sharer: Pick; mine?: { label: string; emoji?: string } }) {
  const g = useGame();
  const s = g.share!;
  const same = !!mine && mine.label === sharer.label;
  const advisor = s.role === 'advisor';
  const voice = s.voices?.[sharer.key];
  const said = g.voices[sharer.key];
  const judged = g.judged[sharer.key];
  // TA 这一题是用语音说的：揭晓时放一遍原声
  useEffect(() => {
    if (voice?.vid) playVoice(voice.vid);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const judge = (v: 'ok' | 'rethink') => (
    <button
      onClick={() => {
        sfx.tap();
        g.judge(sharer.key, v);
      }}
      className={`rounded-full border-2 px-2.5 py-0.5 text-xs font-black ${judged === v ? (v === 'ok' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-amber-500 bg-amber-500 text-white') : 'border-slate-200 bg-white text-slate-600'}`}
    >
      {v === 'ok' ? `👍 ${t('revealOk')}` : `🤔 ${t('revealRethink')}`}
    </button>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`rounded-2xl border-2 px-2.5 py-2 ${same ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
      <div className="flex items-start gap-2">
        <FriendBadge name={s.from} size={30} />
        <div className="min-w-0 flex-1 text-sm font-bold text-slate-700">
          <div className="text-[11px] font-black text-slate-400">{sharer.q}</div>
          {t('revealPicked', { from: s.from })}
          <b>
            「{sharer.emoji ? `${sharer.emoji} ` : ''}
            {sharer.label}」
          </b>
          {voice?.vid && (
            <button onClick={() => playVoice(voice.vid)} className="ml-1 rounded-full bg-rose-500 px-1.5 text-xs text-white" aria-label={t('voiceListen')}>
              ▶
            </button>
          )}
          <div className={`text-xs font-black ${same ? 'text-emerald-600' : 'text-rose-600'}`}>{same ? `✅ ${t('revealSame')}` : mine ? `😮 ${t('revealDiff', { mine: mine.label })}` : ''}</div>
        </div>
      </div>
      {advisor && (
        <div className="mt-1.5 flex gap-1.5 pl-9">
          {judge('ok')}
          {judge('rethink')}
        </div>
      )}
      {said ? (
        <div className="mt-1.5 pl-9 text-xs font-bold text-rose-800">
          {said.vid ? '🎙' : '💬'} 「{said.text}」
        </div>
      ) : (
        (!same || judged === 'rethink') && <Tease pkey={sharer.key} from={s.from} />
      )}
    </motion.div>
  );
}

/** 就地吐槽：按住说一句（传上去转文字），或者打字 */
function Tease({ pkey, from }: { pkey: string; from: string }) {
  const g = useGame();
  const cfg = useCanGenerate();
  const mic = !!cfg?.voice && canRecord();
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'fail'>('idle');
  const { recording, sec, hold } = useRecorder({
    maxSec: 15,
    onDenied: () => setTyping(true),
    onClip: (blob) => {
      setState('sending');
      void uploadVoice(g.share!.id, blob).then((v) => {
        if ('error' in v) return setState('fail');
        sfx.good();
        g.tease(pkey, v);
      });
    },
  });

  if (typing || !mic)
    return (
      <div className="mt-1.5 flex gap-1.5 pl-9">
        <input
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 120))}
          onKeyDown={(e) => e.key === 'Enter' && text.trim() && g.tease(pkey, { vid: '', text: text.trim() })}
          placeholder={t('teasePh', { from })}
          className="min-w-0 flex-1 rounded-xl border-2 border-slate-200 bg-white px-2 py-1 text-sm font-bold text-slate-700 outline-none focus:border-rose-300"
        />
        <button disabled={!text.trim()} onClick={() => g.tease(pkey, { vid: '', text: text.trim() })} className="rounded-xl bg-rose-500 px-2.5 text-xs font-black text-white disabled:opacity-40">
          {t('teaseSend')}
        </button>
      </div>
    );
  return (
    <div className="mt-1.5 flex items-center gap-2 pl-9">
      <motion.button
        {...hold}
        animate={recording ? { scale: [1, 1.08, 1] } : { scale: 1 }}
        transition={recording ? { repeat: Infinity, duration: 0.8 } : {}}
        disabled={state === 'sending'}
        className={`select-none rounded-full px-3 py-1 text-xs font-black text-white ${recording ? 'bg-rose-600' : 'bg-rose-500'} disabled:opacity-50`}
      >
        {recording ? t('teaseRec', { s: Math.max(0, Math.ceil(15 - sec)) }) : state === 'sending' ? t('voiceSending') : `🎙 ${t('teaseHold', { from })}`}
      </motion.button>
      <button onClick={() => setTyping(true)} className="text-xs font-black text-slate-400">
        ✍️
      </button>
      {state === 'fail' && <span className="text-xs font-black text-rose-500">{t('voiceFail')}</span>}
    </div>
  );
}

/**
 * 不是对话的回合（单选、滑动、文牒登记、连环取舍、终章的做法…）：交卷后在反馈条里揭晓这一回合 TA 的选择。
 * 对话里的提问在对话里当场揭晓，这里不重复。不一样的排前面，最多 4 条
 */
export function RoundReveals({ round }: { round: Round }) {
  const g = useGame();
  if (!g.share || !g.lesson || round.type === 'talk' || round.type === 'map') return null;
  const inRound = (p: Pick) => p.key === round.id || (round.type !== 'boss' && p.key.startsWith(`${round.id}.`));
  const mine = new Map(picksOf(g.lesson, g.answers).filter(inRound).map((p) => [p.key, p]));
  const theirs = g.share.picks.filter((p) => inRound(p) && !p.own);
  if (!theirs.length) return null;
  const rows = [...theirs].sort((a, b) => Number(mine.get(a.key)?.label === a.label) - Number(mine.get(b.key)?.label === b.label)).slice(0, 4);
  return (
    <div className="mb-3 max-h-[42vh] space-y-1.5 overflow-y-auto">
      {rows.map((p) => (
        <RevealRow key={p.key} sharer={p} mine={mine.get(p.key)} />
      ))}
    </div>
  );
}
