import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { GUIDE } from '../chars/library';
import { Character } from '../chars/Character';
import { uploadVoice, useCanGenerate, type Voice } from '../api';
import { sfx } from '../fx/fx';
import { hush } from '../fx/voice';
import { useGame, type VoiceAsk as VoiceAskT } from '../game';
import { t } from '../i18n';
import { Emoji } from '../ui/Emoji';
import { Btn } from '../ui/kit';

/** 一段原声最长几秒 */
const MAX_SEC = 15;

const canRecord = () => typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
const mimeOf = () => (['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'] as const).find((m) => MediaRecorder.isTypeSupported?.(m)) ?? '';

/**
 * 在分歧处请朋友留一句原声：和分享的人选得不一样时「吐槽一下 TA」，参谋点了「再想想」时「说说哪里不行」。
 * 按住说话（最长 15 秒），松开上传、转文字；录不了音（没麦克风、微信里不行）就打字。分享的人以后玩到这里会听到。
 */
// ask 由外面传进来，不从 g.voiceAsk 读：关掉以后退场动画还要再画几帧，那时 g.voiceAsk 已经是 null 了
export function VoiceAsk({ ask }: { ask: VoiceAskT }) {
  const g = useGame();
  const from = g.share?.from || t('friendSomeone');
  const cfg = useCanGenerate();
  const mic = !!cfg?.voice && canRecord();
  const [state, setState] = useState<'idle' | 'rec' | 'sending' | 'done' | 'fail'>('idle');
  const [sec, setSec] = useState(0);
  const [typed, setTyped] = useState('');
  const [typing, setTyping] = useState(false);
  const [result, setResult] = useState<Voice | null>(null);
  const rec = useRef<{
    r: MediaRecorder;
    stream: MediaStream;
    parts: Blob[];
    timer: number;
  } | null>(null);

  useEffect(() => {
    hush();
    return () => stop(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    if (state === 'rec' || state === 'sending') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = mimeOf();
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const parts: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && parts.push(e.data);
      r.start();
      sfx.tap();
      setSec(0);
      setState('rec');
      const t0 = Date.now();
      const timer = window.setInterval(() => {
        const s = (Date.now() - t0) / 1000;
        setSec(s);
        if (s >= MAX_SEC) stop(true);
      }, 200);
      rec.current = { r, stream, parts, timer };
    } catch {
      setTyping(true);
    }
  };

  const stop = (send: boolean) => {
    const cur = rec.current;
    if (!cur) return;
    rec.current = null;
    clearInterval(cur.timer);
    cur.r.onstop = () => {
      cur.stream.getTracks().forEach((x) => x.stop());
      if (!send) return;
      const blob = new Blob(cur.parts, {
        type: cur.r.mimeType || 'audio/webm',
      });
      if (blob.size < 2000) return setState('idle');
      setState('sending');
      void uploadVoice(g.share!.id, blob).then((v) => {
        if ('error' in v) return setState('fail');
        sfx.good();
        setResult(v);
        setState('done');
      });
    };
    cur.r.stop();
  };

  const title =
    ask.kind === 'split' && ask.sharer && ask.me
      ? t('voiceSplit', {
          from,
          a: `${ask.sharer.emoji ?? ''} ${ask.sharer.label}`,
          b: `${ask.me.emoji ?? ''} ${ask.me.label}`,
        })
      : t('voiceRethink', { q: ask.q });

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-7">
        <div className="flex items-start gap-3">
          <div className="shrink-0 overflow-hidden rounded-2xl bg-amber-50">
            <Character id={GUIDE} size={64} bust mood="smug" />
          </div>
          <div>
            <div className="text-[17px] font-black leading-snug text-slate-700">{title}</div>
            <div className="mt-1 text-sm font-bold text-slate-400">
              {t(ask.kind === 'split' ? 'voiceSplitSub' : 'voiceRethinkSub', {
                from,
              })}
            </div>
          </div>
        </div>

        {result ? (
          <div className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
            {result.vid ? '🎙 ' : '💬 '}「{result.text}」
          </div>
        ) : typing || !mic ? (
          <div className="mt-4 space-y-2">
            <textarea
              value={typed}
              onChange={(e) => setTyped(e.target.value.slice(0, 200))}
              rows={2}
              placeholder={t('voiceTypePh', { from })}
              className="w-full rounded-2xl border-2 border-slate-200 px-3 py-2 text-[15px] font-bold text-slate-700 outline-none focus:border-sky-400"
            />
            <Btn
              disabled={!typed.trim()}
              onClick={() => {
                sfx.good();
                setResult({ vid: '', text: typed.trim() });
                setState('done');
              }}
            >
              {t('voiceTypeSend')}
            </Btn>
          </div>
        ) : (
          <div className="mt-5 flex flex-col items-center gap-2">
            <motion.button
              onPointerDown={(e) => {
                e.preventDefault();
                void start();
              }}
              onPointerUp={() => stop(true)}
              onPointerLeave={() => state === 'rec' && stop(true)}
              onContextMenu={(e) => e.preventDefault()}
              animate={state === 'rec' ? { scale: [1, 1.08, 1] } : { scale: 1 }}
              transition={state === 'rec' ? { repeat: Infinity, duration: 0.8 } : {}}
              disabled={state === 'sending'}
              className={`flex h-24 w-24 select-none items-center justify-center rounded-full border-b-[6px] text-4xl shadow-lg ${state === 'rec' ? 'border-rose-700 bg-rose-500' : 'border-sky-700 bg-sky-500'} disabled:opacity-60`}
              style={{ touchAction: 'none', WebkitUserSelect: 'none' }}
            >
              <Emoji e={state === 'sending' ? '⏳' : '🎙️'} size={40} />
            </motion.button>
            <div className="text-sm font-black text-slate-500">
              {state === 'rec'
                ? t('voiceRecording', {
                    s: Math.max(0, Math.ceil(MAX_SEC - sec)),
                  })
                : state === 'sending'
                  ? t('voiceSending')
                  : state === 'fail'
                    ? t('voiceFail')
                    : t('voiceHold')}
            </div>
            <button onClick={() => setTyping(true)} className="text-xs font-black text-slate-400">
              {t('voiceOrType')}
            </button>
          </div>
        )}

        <AnimatePresence>
          {result ? (
            <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 space-y-2">
              <div className="text-center text-xs font-bold text-slate-400">{t('voiceKept', { from })}</div>
              <Btn onClick={() => g.answerVoice(result)}>{t('voiceDone')}</Btn>
              {result.vid && (
                <button
                  onClick={() => {
                    setResult(null);
                    setState('idle');
                  }}
                  className="w-full text-center text-xs font-black text-slate-400"
                >
                  {t('voiceRedo')}
                </button>
              )}
            </motion.div>
          ) : (
            <button key="skip" onClick={() => g.answerVoice(null)} className="mt-4 w-full text-center text-sm font-black text-slate-400">
              {t('voiceSkip')}
            </button>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
