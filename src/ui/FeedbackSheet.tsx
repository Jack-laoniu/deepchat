import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import type { Feedback } from '../game';
import { t } from '../i18n';
import { Emoji } from './Emoji';
import { Btn, PriceBadge } from './kit';

const STYLE = {
  good: { bg: 'bg-green-100', text: 'text-green-700', btn: 'green' as const, icon: '✅', cta: 'next' as const },
  warn: { bg: 'bg-orange-100', text: 'text-orange-700', btn: 'amber' as const, icon: '⚠️', cta: 'goFix' as const },
  risk: { bg: 'bg-amber-100', text: 'text-amber-700', btn: 'amber' as const, icon: '🎲', cta: 'next' as const },
  crash: { bg: 'bg-rose-100', text: 'text-rose-700', btn: 'red' as const, icon: '💥', cta: 'retry' as const },
};

/** 底部反馈条：每次选择后弹出，一句话 + 一个按钮；extra 放在按钮上面（朋友玩分享的关时揭晓 TA 的选择） */
export function FeedbackSheet({ fb, onNext, extra }: { fb: Feedback | null; onNext: () => void; extra?: ReactNode }) {
  return (
    <AnimatePresence>
      {fb && (
        <motion.div
          key={fb.title + fb.tip}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          className={`fixed inset-x-0 bottom-0 z-30 ${STYLE[fb.tone].bg} px-5 pb-6 pt-4`}
        >
          <div className="mx-auto max-w-md">
            <div className="mb-3 flex items-center gap-3">
              {fb.emoji ? <Emoji e={fb.emoji} size={52} replay={1} /> : <span className="text-4xl">{STYLE[fb.tone].icon}</span>}
              <div className="min-w-0 flex-1">
                <div className={`flex items-center gap-2 text-2xl font-black ${STYLE[fb.tone].text}`}>
                  {fb.title}
                  <PriceBadge delta={fb.delta} />
                </div>
                {fb.tip && <div className={`text-base font-bold ${STYLE[fb.tone].text} opacity-80`}>{fb.tip}</div>}
              </div>
            </div>
            {extra}
            <Btn tone={STYLE[fb.tone].btn} onClick={onNext}>
              {t(STYLE[fb.tone].cta)}
            </Btn>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
