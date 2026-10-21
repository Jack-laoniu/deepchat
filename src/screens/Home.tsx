import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { useGame } from '../game';
import { SAMPLES } from '../lessons';
import { generatorPrompt } from '../lesson/prompt';
import { parseLesson, type Lesson } from '../lesson/schema';
import { Emoji } from '../ui/Emoji';
import { Btn, Mascot } from '../ui/kit';
import { copyText } from '../ui/copy';

export function Home() {
  const g = useGame();
  const [studio, setStudio] = useState(false);
  const samples = useMemo(() => SAMPLES.map((s) => parseLesson(s)).flatMap((r) => (r.ok ? [r.lesson] : [])), []);

  return (
    <div className="flex h-full flex-col px-5 pb-6 pt-10">
      <div className="flex flex-col items-center">
        <Mascot mood="idle" size={120} />
        <h1 className="mt-3 text-center text-3xl font-black text-slate-700">想搞定什么？</h1>
        <p className="mt-1 text-center text-base font-bold text-slate-400">玩一局，帮你理清需求</p>
      </div>

      <div className="mt-8 space-y-3">
        {samples.map((l, i) => (
          <motion.button
            key={l.title}
            initial={{ x: -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 + i * 0.1 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => g.open(l)}
            className="flex w-full items-center gap-4 rounded-3xl border-2 border-b-[5px] border-slate-200 bg-white p-3 text-left hover:bg-slate-50"
          >
            <Emoji e={l.emoji} size={56} />
            <div className="min-w-0 flex-1">
              <div className="text-lg font-black text-slate-700">{l.title}</div>
              <div className="truncate text-sm font-bold text-slate-400">「{l.need}」</div>
            </div>
            <span className="text-2xl text-slate-300">›</span>
          </motion.button>
        ))}
      </div>

      <div className="mt-auto pt-6">
        <Btn tone="blue" onClick={() => setStudio(true)}>
          ✨ 我的需求，生成新关卡
        </Btn>
      </div>

      <AnimatePresence>{studio && <Studio onClose={() => setStudio(false)} onLoad={(l) => g.open(l)} />}</AnimatePresence>
    </div>
  );
}

/** 独立网页版用：把提示词复制给任意大模型，再把它返回的 JSON 粘回来 */
function Studio({ onClose, onLoad }: { onClose: () => void; onLoad: (l: Lesson) => void }) {
  const [need, setNeed] = useState('');
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
        <div className="text-xl font-black text-slate-700">① 写下你的需求</div>
        <input
          value={need}
          onChange={(e) => setNeed(e.target.value)}
          placeholder="比如：想在阳台种菜"
          className="w-full rounded-2xl border-2 border-slate-200 px-4 py-3 text-lg font-bold outline-none focus:border-sky-400"
        />
        <Btn
          tone="blue"
          disabled={!need.trim()}
          onClick={async () => {
            if (await copyText(generatorPrompt(need.trim()))) {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }
          }}
        >
          {copied ? '✅ 已复制，发给任意 AI' : '📋 复制提示词'}
        </Btn>
        <div className="pt-2 text-xl font-black text-slate-700">② 粘贴 AI 回复的 JSON</div>
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
            <div className="mt-1 text-rose-400">把这些错误发回给 AI，让它改一下</div>
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
          开玩！
        </Btn>
      </motion.div>
    </motion.div>
  );
}
