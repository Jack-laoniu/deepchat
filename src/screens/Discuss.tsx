import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { loadCode, useCanGenerate } from '../api';
import { Character } from '../chars/Character';
import { charById, GUIDE } from '../chars/library';
import { sfx } from '../fx/fx';
import { speak, speakNow } from '../fx/voice';
import { hostFollowUp, inHost } from '../host';
import { getLang, t, type MsgKey } from '../i18n';
import { copyText } from '../ui/copy';

/**
 * 结算后「和乐乐继续聊聊」：用户可以就方案继续追问，乐乐回答并再追问一个细节，把需求挖得更深。
 * - 在 ChatGPT / Claude 里：问题连同方案直接发给宿主的 AI（用的是平台用户自己的额度）
 * - 网页版且服务器配了 key：调用 /api/discuss，在这里直接聊
 * - 都不行：复制「方案 + 问题」，粘贴给任意 AI
 */

export type Turn = { role: 'user' | 'assistant'; content: string };

const ERR: Record<string, MsgKey> = { code: 'genCode', rate_ip: 'genRate', rate_day: 'genRate', busy: 'genBusy' };

export function Discuss({ plan, turns, setTurns }: { plan: string; turns: Turn[]; setTurns: (f: (t: Turn[]) => Turn[]) => void }) {
  const cfg = useCanGenerate();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const guide = charById(GUIDE)!;
  const live = !inHost() && !!cfg?.generate;

  useEffect(() => {
    if (turns.length) end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [turns.length, busy]);

  const ask = async (q: string) => {
    q = q.trim();
    if (!q || busy) return;
    sfx.tap();
    setText('');
    setNote('');
    if (inHost()) {
      await hostFollowUp(`${plan}\n\n${q}`);
      setNote(t('discussHost'));
      return;
    }
    if (!live) {
      if (await copyText(`${plan}\n\n${q}`)) setNote(t('discussCopied'));
      return;
    }
    const history = turns;
    setTurns((ts) => [...ts, { role: 'user', content: q }]);
    setBusy(true);
    try {
      const r = await fetch('/api/discuss', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan, history, message: q, lang: getLang() === 'en' ? 'en' : 'zh', code: loadCode() }),
      });
      const d = (await r.json().catch(() => ({}))) as { reply?: string; error?: string };
      if (!d.reply) throw new Error(d.error ?? 'fail');
      setTurns((ts) => [...ts, { role: 'assistant', content: d.reply! }]);
      sfx.good();
      void speak(d.reply, guide.voice);
    } catch (e) {
      // 失败就把这条问题撤回，方便用户重发
      setTurns((ts) => ts.slice(0, -1));
      setText(q);
      setNote(t(ERR[(e as Error).message] ?? 'discussFail'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 rounded-3xl border-2 border-b-4 border-sky-200 bg-sky-50/60 p-3">
      <div className="mb-2 text-sm font-black text-sky-700">{t('discussTitle')}</div>
      <div className="space-y-2">
        <Line mine={false} text={t('discussHi')} />
        {turns.map((m, i) => (
          <Line key={i} mine={m.role === 'user'} text={m.content} />
        ))}
        {busy && <Line mine={false} text={t('discussThinking')} typing />}
        <div ref={end} />
      </div>

      {!busy && (
        <div className="mt-3 flex flex-wrap gap-2">
          {t('discussChips')
            .split('|')
            .filter((c) => !turns.some((m) => m.content === c))
            .map((c) => (
              <button key={c} onClick={() => ask(c)} className="rounded-full border-2 border-b-4 border-sky-200 bg-white px-3 py-1 text-sm font-extrabold text-sky-700 active:translate-y-0.5 active:border-b-2">
                {c}
              </button>
            ))}
        </div>
      )}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(text);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 400))}
          placeholder={t('discussPh')}
          className="min-w-0 flex-1 rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-[16px] font-bold text-slate-700 outline-none focus:border-sky-400"
        />
        <button disabled={busy || !text.trim()} className="shrink-0 rounded-2xl border-b-4 border-sky-600 bg-sky-500 px-4 font-black text-white disabled:opacity-40">
          {t('discussSend')}
        </button>
      </form>
      {note && <div className="mt-2 text-center text-xs font-black text-slate-500">{note}</div>}
    </div>
  );
}

function Line({ mine, text, typing }: { mine: boolean; text: string; typing?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
      {!mine && (
        <button onClick={() => !typing && speakNow(text, charById(GUIDE)!.voice)} className="shrink-0 overflow-hidden rounded-full bg-white">
          <Character id={GUIDE} size={36} bust talking={typing} mood={typing ? 'thinking' : 'happy'} />
        </button>
      )}
      <div
        className={`max-w-[80%] whitespace-pre-wrap rounded-2xl border-2 px-3 py-2 text-[15px] font-bold leading-snug ${
          mine ? 'border-green-500 bg-green-500 text-white' : 'border-slate-200 bg-white text-slate-700'
        } ${typing ? 'animate-pulse text-slate-400' : ''}`}
      >
        {text}
      </div>
    </motion.div>
  );
}
