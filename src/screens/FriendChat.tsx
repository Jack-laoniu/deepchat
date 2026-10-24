import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { requestFriend, useCanGenerate } from '../api';
import { bondOf, heartsOf, saveChat, toNextHeart, type ChatTurn } from '../bond';
import { Character } from '../chars/Character';
import { charById, type Mood } from '../chars/library';
import { sfx } from '../fx/fx';
import { hush, speakNow } from '../fx/voice';
import { inHost } from '../host';
import { getLang, t, type MsgKey } from '../i18n';
import { Hearts } from '../ui/Hearts';

const ERR: Record<string, MsgKey> = { code: 'genCode', rate_ip: 'genRate', rate_day: 'genRate', busy: 'genBusy' };

/**
 * 和熟人单独聊天：他站在你的角度关心你、记得你说过的事；交情到了会讲自己的故事。
 * plan = 从结算页点进来「帮我看看这个需求」：一打开就把这一局的需求单交给他，听他从自己的角度分析。
 */
export function FriendChat({ id, plan, onClose }: { id: string; plan?: string; onClose: () => void }) {
  const c = charById(id)!;
  const name = c.name[getLang()];
  const cfg = useCanGenerate();
  const live = !inHost() && !!cfg?.generate;
  const [bond, setBond] = useState(() => bondOf(id));
  const hearts = heartsOf(bond.xp);
  const [turns, setTurns] = useState<ChatTurn[]>(() => (plan ? [] : bond.chat));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [talking, setTalking] = useState(false);
  const [note, setNote] = useState('');
  const [story, setStory] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), [turns.length, busy]);
  useEffect(() => hush, []);

  const say = (s: string) => {
    setTalking(true);
    void speakNow(s, c.voice).then(() => setTalking(false));
  };

  const send = async (q: string) => {
    q = q.trim();
    if (!q || busy || !live) return;
    sfx.tap();
    setText('');
    setNote('');
    const history = turns;
    const next: ChatTurn[] = [...turns, { role: 'user', content: q }];
    setTurns(next);
    setBusy(true);
    const r = await requestFriend({ who: id, hearts, history, message: q, stories: bond.stories, quests: bond.quests, plan });
    setBusy(false);
    if ('error' in r) {
      setTurns(history);
      setText(q);
      setNote(t(ERR[r.error] ?? 'discussFail'));
      return;
    }
    const all: ChatTurn[] = [...next, { role: 'assistant', content: r.reply }];
    setTurns(all);
    sfx.good();
    say(r.reply);
    saveChat(id, all, r.story);
    setBond(bondOf(id));
    if (r.story) {
      setStory(true);
      setTimeout(() => setStory(false), 3200);
    }
  };

  // 从结算页带着需求单进来：直接请他看看
  useEffect(() => {
    if (plan && live && !asked.current) {
      asked.current = true;
      void send(t('friendPlanAsk'));
    }
  }, [live]); // eslint-disable-line react-hooks/exhaustive-deps

  const mood: Mood = busy ? 'thinking' : talking ? 'happy' : 'neutral';

  return (
    <motion.div className="fixed inset-0 z-50 flex justify-center bg-slate-900/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="flex h-full w-full max-w-md flex-col bg-gradient-to-b from-rose-50 to-white"
      >
        <div className="flex items-center gap-3 px-4 pb-2 pt-4">
          <motion.div className="overflow-hidden rounded-3xl bg-white shadow-sm" animate={{ y: talking ? [0, -3, 0] : 0 }} transition={{ repeat: talking ? Infinity : 0, duration: 0.6 }}>
            <Character id={id} size={76} bust mood={mood} talking={talking} />
          </motion.div>
          <div className="min-w-0 flex-1">
            <div className="text-2xl font-black text-slate-700">{name}</div>
            <Hearts n={hearts} size={18} />
            {toNextHeart(bond.xp) > 0 && <div className="mt-0.5 text-[11px] font-bold text-slate-400">{t('friendNext', { n: toNextHeart(bond.xp) })}</div>}
          </div>
          <button onClick={onClose} className="self-start rounded-full bg-white px-3 py-1 text-sm font-black text-slate-400 shadow-sm">
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-2">
          <Bubble text={t(plan ? 'friendHiPlan' : 'friendHi')} onTap={() => say(t(plan ? 'friendHiPlan' : 'friendHi'))} />
          {turns.map((m, i) => (m.role === 'user' ? <Mine key={i} text={m.content} /> : <Bubble key={i} text={m.content} onTap={() => say(m.content)} />))}
          {busy && <Bubble text="…" typing />}
          {!live && cfg && <div className="pt-4 text-center text-sm font-black text-slate-400">{t('friendOffline')}</div>}
          <div ref={end} />
        </div>

        <AnimatePresence>
          {story && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mx-4 mb-2 rounded-2xl bg-amber-100 px-3 py-2 text-center text-sm font-black text-amber-700"
            >
              {t('friendStory', { name })}
            </motion.div>
          )}
        </AnimatePresence>

        {live && !busy && (
          <div className="flex flex-wrap gap-2 px-4">
            {t('friendChips')
              .split('|')
              .map((chip) => (
                <button key={chip} onClick={() => send(chip)} className="rounded-full border-2 border-b-4 border-rose-200 bg-white px-3 py-1 text-sm font-extrabold text-rose-600 active:translate-y-0.5">
                  {chip}
                </button>
              ))}
          </div>
        )}
        <form
          className="flex gap-2 px-4 pb-5 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <input
            value={text}
            disabled={!live}
            onChange={(e) => setText(e.target.value.slice(0, 400))}
            placeholder={t('friendPh', { name })}
            className="min-w-0 flex-1 rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-[16px] font-bold text-slate-700 outline-none focus:border-rose-300"
          />
          <button disabled={busy || !text.trim()} className="shrink-0 rounded-2xl border-b-4 border-rose-600 bg-rose-500 px-4 font-black text-white disabled:opacity-40">
            {t('discussSend')}
          </button>
        </form>
        {note && <div className="pb-3 text-center text-xs font-black text-slate-500">{note}</div>}
      </motion.div>
    </motion.div>
  );
}

function Bubble({ text, typing, onTap }: { text: string; typing?: boolean; onTap?: () => void }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onTap}
      className={`block max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-sm border-2 border-slate-100 bg-white px-3 py-2 text-left text-[15px] font-bold leading-snug text-slate-700 shadow-sm ${typing ? 'animate-pulse text-slate-400' : ''}`}
    >
      {text}
    </motion.button>
  );
}

function Mine({ text }: { text: string }) {
  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex justify-end">
      <span className="max-w-[85%] rounded-2xl rounded-tr-sm bg-rose-500 px-3 py-2 text-[15px] font-bold text-white">{text}</span>
    </motion.div>
  );
}
