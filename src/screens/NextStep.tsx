import { motion } from 'framer-motion';
import { useRef, useState } from 'react';
import { requestLesson, useCanGenerate } from '../api';
import { sfx } from '../fx/fx';
import { useGame } from '../game';
import { hostFollowUp, inHost } from '../host';
import { getLang, t } from '../i18n';
import { generatorPrompt } from '../lesson/prompt';
import { copyText } from '../ui/copy';
import { Btn } from '../ui/kit';
import { Discuss, type Turn } from './Discuss';
import { Generating } from './Generating';

/**
 * 通关后用户觉得需求还没说清楚：自己选「继续聊聊」还是「再玩一轮」。
 * 再玩一轮 = 把这一关的结果（方案、原话、聊过的内容、用户说的没说清的地方）交给 AI，出一关新的去挖剩下的部分。
 */
export function NextStep({ plan, text, turns, setTurns }: { plan: string; text: string; turns: Turn[]; setTurns: (f: (t: Turn[]) => Turn[]) => void }) {
  const g = useGame();
  const cfg = useCanGenerate();
  const live = !inHost() && !!cfg?.generate;
  const [mode, setMode] = useState<'chat' | 'play' | null>(null);
  const [unclear, setUnclear] = useState('');
  const [loading, setLoading] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const abort = useRef<AbortController | null>(null);

  const context = () => (unclear.trim() ? `${text}\n\n## ${t('unclearLabel')}\n${unclear.trim()}` : text);

  const replay = async () => {
    sfx.tap();
    setNote('');
    const need = g.lesson!.need;
    if (inHost()) {
      await hostFollowUp(`${context()}\n\n${t('replayHostAsk')}`);
      return setNote(t('discussHost'));
    }
    if (!live) {
      const prompt = `${generatorPrompt(need, getLang() === 'en' ? 'en' : 'zh')}\n\n${context()}\n\n${t('replayHostAsk')}`;
      if (await copyText(prompt)) setNote(t('replayCopied'));
      return;
    }
    const ctrl = new AbortController();
    abort.current = ctrl;
    setLoading(Date.now());
    const r = await requestLesson(need, { context: context(), signal: ctrl.signal });
    if ('lesson' in r) return g.open(r.lesson);
    setLoading(null);
    if (r.error) setNote(r.error);
  };

  const tile = (m: 'chat' | 'play', title: string, sub: string) => (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={() => {
        sfx.tap();
        setMode(m);
      }}
      className={`rounded-2xl border-2 border-b-4 p-3 text-left ${mode === m ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white'}`}
    >
      <div className="text-[16px] font-black text-slate-700">{title}</div>
      <div className="mt-0.5 text-xs font-bold text-slate-400">{sub}</div>
    </motion.button>
  );

  return (
    <div className="mt-5">
      <div className="mb-2 text-sm font-black text-slate-400">{t('nextTitle')}</div>
      <div className="grid grid-cols-2 gap-3">
        {tile('chat', t('nextChat'), t('nextChatSub'))}
        {tile('play', t('nextPlay'), t('nextPlaySub'))}
      </div>

      {mode === 'chat' && <Discuss plan={plan} turns={turns} setTurns={setTurns} />}

      {mode === 'play' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-3 space-y-2 rounded-3xl border-2 border-b-4 border-sky-200 bg-sky-50/60 p-3">
          <textarea
            value={unclear}
            onChange={(e) => setUnclear(e.target.value.slice(0, 300))}
            rows={2}
            placeholder={t('replayPh')}
            className="w-full resize-none rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-[16px] font-bold text-slate-700 outline-none focus:border-sky-400"
          />
          <Btn onClick={replay}>{t('replayGo')}</Btn>
          {note && <div className="text-center text-xs font-black text-slate-500">{note}</div>}
        </motion.div>
      )}

      {loading !== null && (
        <div className="fixed inset-0 z-50 mx-auto max-w-md bg-white">
          <Generating
            started={loading}
            onCancel={() => {
              abort.current?.abort();
              setLoading(null);
            }}
          />
        </div>
      )}
    </div>
  );
}
