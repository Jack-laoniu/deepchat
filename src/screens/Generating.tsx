import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Character } from '../chars/Character';
import { GUIDE } from '../chars/library';
import { t } from '../i18n';

/** 等待生成：小芳在想，提示轮换，显示已等待时间 */
export function Generating({ started, onCancel }: { started: number; onCancel: () => void }) {
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
