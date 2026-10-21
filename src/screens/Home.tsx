import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Character } from '../chars/Character';
import { GUIDE } from '../chars/library';
import { useGame } from '../game';
import { SAMPLES } from '../lessons';
import { generatorPrompt } from '../lesson/prompt';
import { parseLesson, type Lesson } from '../lesson/schema';
import { Emoji } from '../ui/Emoji';
import { Btn, Mascot } from '../ui/kit';
import { copyText } from '../ui/copy';
import { detectLang, t } from '../i18n';

type GenState = { phase: 'idle' } | { phase: 'loading'; started: number } | { phase: 'error'; msg: string };

/** 服务端有没有配 API key（网页版能不能在线生成） */
function useCanGenerate() {
  const [cfg, setCfg] = useState<{ generate: boolean; needCode: boolean } | null>(null);
  useEffect(() => {
    fetch('/api/config')
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: { generate?: boolean; needCode?: boolean }) => setCfg({ generate: !!d.generate, needCode: !!d.needCode }))
      .catch(() => setCfg({ generate: false, needCode: false }));
  }, []);
  return cfg;
}

const CODE_KEY = 'need-quest-code';
const loadCode = () => {
  try {
    return localStorage.getItem(CODE_KEY) ?? '';
  } catch {
    return '';
  }
};
const saveCode = (c: string) => {
  try {
    localStorage.setItem(CODE_KEY, c);
  } catch {
    /* 隐私模式下存不了，下次重新输入 */
  }
};

export function Home() {
  const g = useGame();
  const lang = detectLang();
  const cfg = useCanGenerate();
  const canGenerate = cfg?.generate ?? null;
  const [code, setCode] = useState(loadCode);
  const [studio, setStudio] = useState(false);
  const [need, setNeed] = useState('');
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
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ need: text, lang, code }),
        signal: ctrl.signal,
      });
      const data = (await res.json().catch(() => ({}))) as { lesson?: unknown; error?: string };
      const r = data.lesson ? parseLesson(data.lesson) : null;
      if (r?.ok) return g.open(r.lesson);
      const msg =
        data.error === 'code' ? t('genCode') :
        data.error === 'rate_ip' || data.error === 'rate_day' ? t('genRate') :
        data.error === 'busy' ? t('genBusy') : t('genFail');
      setGen({ phase: 'error', msg });
    } catch {
      if (!ctrl.signal.aborted) setGen({ phase: 'error', msg: t('genFail') });
    }
  };

  if (gen.phase === 'loading') return <Generating started={gen.started} onCancel={() => (abort.current?.abort(), setGen({ phase: 'idle' }))} />;

  return (
    <div className="flex h-full flex-col overflow-y-auto px-5 pb-6 pt-6">
      <div className="flex items-end gap-3">
        <Mascot mood={gen.phase === 'error' ? 'worried' : 'idle'} size={70} />
        <h1 className="mb-3 text-2xl font-black leading-tight text-slate-700">{t('genTitle')}</h1>
      </div>

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

/** 等待生成：乐乐在想，提示轮换，显示已等待时间 */
function Generating({ started, onCancel }: { started: number; onCancel: () => void }) {
  const tips = t('genTips').split('|');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const sec = Math.floor((now - started) / 1000);
  const tip = tips[Math.min(tips.length - 1, Math.floor(sec / 12))];
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <Character id={GUIDE} size={130} mood="thinking" act={sec % 8 < 4 ? 'idle' : 'walk'} />
      <div className="mt-4 text-2xl font-black text-slate-700">{t('genWait')}</div>
      <AnimatePresence mode="wait">
        <motion.div key={tip} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 text-base font-bold text-slate-500">
          {tip}
        </motion.div>
      </AnimatePresence>
      <div className="mt-6 h-3 w-56 overflow-hidden rounded-full bg-slate-200">
        <motion.div className="h-full rounded-full bg-green-500" animate={{ width: `${Math.min(95, (sec / 90) * 100)}%` }} transition={{ duration: 1 }} />
      </div>
      <div className="mt-2 text-xs font-bold text-slate-400">
        {t('genSlow')} · {sec}s
      </div>
      <button onClick={onCancel} className="mt-8 text-sm font-extrabold text-slate-400 hover:text-slate-600">
        {t('cancel')}
      </button>
    </div>
  );
}

/** 独立网页版用：把提示词复制给任意大模型，再把它返回的 JSON 粘回来 */
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
            if (await copyText(generatorPrompt(need.trim(), detectLang()))) {
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
