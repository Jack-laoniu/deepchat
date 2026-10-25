import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { playMusic } from '../fx/music';
import { useGame } from '../game';
import { SAMPLES } from '../lessons';
import { generatorPrompt } from '../lesson/prompt';
import { parseLesson, type Lesson } from '../lesson/schema';
import { Emoji } from '../ui/Emoji';
import { Btn, Mascot } from '../ui/kit';
import { copyText } from '../ui/copy';
import { Generating } from './Generating';
import { detectLang, getLang, t } from '../i18n';
import { CHAT_AT, friends } from '../bond';
import { Character } from '../chars/Character';
import { charById } from '../chars/library';
import { sfx } from '../fx/fx';
import { Hearts } from '../ui/Hearts';
import { FriendChat } from './FriendChat';
import { PanelGuard } from '../ui/RoundGuard';
import { loadCode, requestLesson, saveCode, useCanGenerate } from '../api';
import { forget, memories, memoryOn, memoryText, setMemoryOn, type QuestMemory } from '../memory';

type GenState = { phase: 'idle' } | { phase: 'loading'; started: number } | { phase: 'error'; msg: string };

export function Home() {
  useEffect(() => playMusic('home'), []);
  const g = useGame();
  const lang = detectLang();
  const cfg = useCanGenerate();
  const canGenerate = cfg?.generate ?? null;
  const [code, setCode] = useState(loadCode);
  const [studio, setStudio] = useState(false);
  // 朋友通过「让朋友帮我选」的链接进来：带着朋友的需求，填好等他开玩（同一个需求服务器有缓存，开得快）
  const [friendNeed] = useState(() => {
    try {
      const q = new URLSearchParams(location.search);
      return q.get('from') === 'friend' ? (q.get('need') ?? '').slice(0, 200) : '';
    } catch {
      return '';
    }
  });
  const [need, setNeed] = useState(friendNeed);
  const [gen, setGen] = useState<GenState>({ phase: 'idle' });
  const abort = useRef<AbortController | null>(null);
  // 只展示和界面同一种语言的示例
  const samples = useMemo(
    () => SAMPLES.map((s) => parseLesson(s)).flatMap((r) => (r.ok && r.lesson.lang === lang ? [r.lesson] : [])),
    [lang],
  );

  const generate = async () => {
    const text = need.trim();
    if (!text) return;
    if (!canGenerate) return setStudio(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    setGen({ phase: 'loading', started: Date.now() });
    const r = await requestLesson(text, { signal: ctrl.signal });
    if ('lesson' in r) return g.open(r.lesson);
    if (!ctrl.signal.aborted) setGen({ phase: 'error', msg: r.error });
  };

  if (gen.phase === 'loading') return <Generating started={gen.started} onCancel={() => (abort.current?.abort(), setGen({ phase: 'idle' }))} />;

  return (
    <div className="flex h-full flex-col overflow-y-auto px-5 pb-6 pt-6">
      <div className="flex items-end gap-3">
        <Mascot mood={gen.phase === 'error' ? 'worried' : 'idle'} size={70} />
        <h1 className="mb-3 text-2xl font-black leading-tight text-slate-700">{t('genTitle')}</h1>
      </div>

      {friendNeed && <div className="mt-3 rounded-2xl border-2 border-sky-300 bg-sky-50 px-3 py-2 text-[15px] font-extrabold text-sky-800">{t('friendAsk', { need: friendNeed })}</div>}
      <div className="mt-3 rounded-3xl border-2 border-b-[5px] border-slate-200 bg-white p-3">
        <textarea
          value={need}
          onChange={(e) => setNeed(e.target.value.slice(0, 200))}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), generate())}
          rows={2}
          placeholder={t('genPh')}
          className="w-full resize-none text-lg font-bold text-slate-700 outline-none placeholder:text-slate-300"
        />
        {cfg?.needCode && (
          <input
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              saveCode(e.target.value);
            }}
            placeholder={t('codePh')}
            className="mb-2 w-full rounded-xl border-2 border-slate-200 px-3 py-1.5 text-sm font-bold outline-none focus:border-sky-400"
          />
        )}
        {gen.phase === 'error' && <div className="mb-2 text-sm font-extrabold text-rose-500">{gen.msg}</div>}
        <Btn disabled={!need.trim() || canGenerate === null} onClick={generate}>
          {t('genGo')}
        </Btn>
      </div>

      <MemoryCard onPick={(m) => setNeed(m.need)} />
      <FriendsRow />

      {samples.length > 0 && <div className="mt-6 text-sm font-black text-slate-400">{t('orTry')}</div>}
      <div className="mt-2 space-y-3">
        {samples.map((l, i) => (
          <motion.button
            key={l.title}
            initial={{ x: -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 + i * 0.08 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => g.open(l)}
            className="flex w-full items-center gap-3 rounded-3xl border-2 border-b-[5px] border-slate-200 bg-white p-2.5 text-left hover:bg-slate-50"
          >
            <Emoji e={l.emoji} size={46} />
            <div className="min-w-0 flex-1">
              <div className="text-base font-black text-slate-700">{l.title}</div>
              <div className="truncate text-sm font-bold text-slate-400">{l.need}</div>
            </div>
            <span className="text-2xl text-slate-300">›</span>
          </motion.button>
        ))}
      </div>

      <button onClick={() => setStudio(true)} className="mt-5 text-center text-xs font-extrabold text-slate-300 hover:text-slate-500">
        {t('advanced')}
      </button>

      <AnimatePresence>{studio && <Studio initialNeed={need} onClose={() => setStudio(false)} onLoad={(l) => g.open(l)} />}</AnimatePresence>
    </div>
  );
}

/** 熟人：交情 > 0 的角色和他们的心数；点一下单独聊天（1 颗心起） */
function FriendsRow() {
  const [list] = useState(friends);
  const [open, setOpen] = useState<string | null>(null);
  const [hint, setHint] = useState('');
  if (!list.length) return null;
  return (
    <div className="mt-5 rounded-3xl border-2 border-rose-200 bg-rose-50 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-base font-black text-rose-600">{t('friendsTitle')}</span>
        <span className="text-[11px] font-bold text-rose-400">{t('friendsNote')}</span>
      </div>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {list.map((f) => {
          const locked = f.hearts < CHAT_AT;
          const name = charById(f.id)!.name[getLang()];
          return (
            <motion.button
              key={f.id}
              whileTap={{ scale: 0.94 }}
              onClick={() => (locked ? setHint(t('friendLocked', { name })) : (sfx.tap(), setOpen(f.id)))}
              className="flex w-[76px] shrink-0 flex-col items-center rounded-2xl bg-white px-1 pb-1.5 pt-1 shadow-sm"
            >
              <div className={`overflow-hidden rounded-xl ${locked ? 'opacity-50 grayscale' : ''}`}>
                <Character id={f.id} size={56} bust mood="happy" />
              </div>
              <span className="mt-0.5 text-xs font-black text-slate-600">{name}</span>
              <Hearts n={f.hearts} size={9} />
            </motion.button>
          );
        })}
      </div>
      {hint && <div className="mt-1 text-center text-xs font-black text-rose-400">{hint}</div>}
      <AnimatePresence>
        {open && (
          <PanelGuard name="friend" onClose={() => setOpen(null)}>
            <FriendChat id={open} onClose={() => setOpen(null)} />
          </PanelGuard>
        )}
      </AnimatePresence>
    </div>
  );
}

/** 「小芳记得你」：这台设备记住的以前闯过的需求，可以逐条忘掉，或者整个关掉 */
function MemoryCard({ onPick }: { onPick: (m: QuestMemory) => void }) {
  const [list, setList] = useState(memories);
  const [on, setOn] = useState(memoryOn);
  if (!on && !list.length)
    return (
      <button onClick={() => (setMemoryOn(true), setOn(true))} className="mt-4 text-left text-xs font-black text-slate-300">
        🧠 {t('memOn')}
      </button>
    );
  if (!list.length) return null;
  return (
    <div className="mt-5 rounded-3xl border-2 border-violet-200 bg-violet-50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-base font-black text-violet-700">{t('memTitle')}</span>
        <button
          onClick={() => {
            setMemoryOn(false);
            setOn(false);
            setList([]);
          }}
          className="text-xs font-black text-violet-400"
        >
          {t('memOff')}
        </button>
      </div>
      <div className="mt-2 space-y-1.5">
        {list.slice(0, 4).map((m) => (
          <div key={m.key} className="flex items-center gap-2 rounded-2xl bg-white px-2.5 py-1.5">
            <Emoji e={m.emoji} size={26} />
            <button onClick={() => onPick(m)} className="min-w-0 flex-1 text-left">
              <div className="truncate text-sm font-black text-slate-700">{m.title}</div>
              <div className="truncate text-xs font-bold text-slate-400">{m.picks.length ? `→ ${m.picks.at(-1)!.split('：').slice(1).join('：')}` : m.need}</div>
            </button>
            <button
              onClick={() => {
                forget(m.key);
                setList(memories());
              }}
              className="shrink-0 rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-400"
            >
              {t('memForget')}
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[11px] font-bold leading-snug text-violet-500/80">{t('memNote')}</div>
    </div>
  );
}

function Studio({ initialNeed, onClose, onLoad }: { initialNeed: string; onClose: () => void; onLoad: (l: Lesson) => void }) {
  const [need, setNeed] = useState(initialNeed);
  const [json, setJson] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  return (
    <motion.div className="fixed inset-0 z-40 flex items-end bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="mx-auto w-full max-w-md space-y-3 rounded-t-3xl bg-white p-5"
      >
        <div className="text-xl font-black text-slate-700">{t('step1')}</div>
        <input
          value={need}
          onChange={(e) => setNeed(e.target.value)}
          placeholder={t('needPh')}
          className="w-full rounded-2xl border-2 border-slate-200 px-4 py-3 text-lg font-bold outline-none focus:border-sky-400"
        />
        <Btn
          tone="blue"
          disabled={!need.trim()}
          onClick={async () => {
            if (await copyText(generatorPrompt(need.trim(), detectLang(), memoryText(need.trim())))) {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }
          }}
        >
          {copied ? t('copied') : t('copyPrompt')}
        </Btn>
        <div className="pt-2 text-xl font-black text-slate-700">{t('step2')}</div>
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          className="h-24 w-full rounded-2xl border-2 border-slate-200 p-3 font-mono text-xs outline-none focus:border-sky-400"
        />
        {errors.length > 0 && (
          <div className="max-h-24 overflow-auto rounded-xl bg-rose-50 p-2 text-xs font-bold text-rose-600">
            {errors.slice(0, 8).map((e) => (
              <div key={e}>• {e}</div>
            ))}
            <div className="mt-1 text-rose-400">{t('errorsHint')}</div>
          </div>
        )}
        <Btn
          disabled={!json.trim()}
          onClick={() => {
            const r = parseLesson(json);
            if (!r.ok) return setErrors(r.errors);
            onLoad(r.lesson);
          }}
        >
          {t('play')}
        </Btn>
      </motion.div>
    </motion.div>
  );
}
