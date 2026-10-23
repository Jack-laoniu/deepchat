import { motion } from 'framer-motion';
import { getGoal, t, type MsgKey } from '../i18n';
import { PIECE_EMOJI, type Piece } from '../lesson/puzzle';
import { Emoji } from './Emoji';

const LABEL: Record<Piece, MsgKey> = {
  why: 'pieceWhy',
  money: 'pieceMoney',
  life: 'pieceLife',
  priority: 'piecePriority',
  tradeoff: 'pieceTradeoff',
  risk: 'pieceRisk',
  direction: 'pieceDirection',
  data: 'pieceData',
};
const COLOR: Record<Piece, string> = {
  why: '#F472B6',
  money: '#F59E0B',
  life: '#38BDF8',
  priority: '#A78BFA',
  tradeoff: '#34D399',
  risk: '#FB7185',
  direction: '#6366F1',
  data: '#14B8A6',
};

/** 拼图块的名字（非金钱关卡里「预算」叫这一关的资源，比如「时间」） */
export const pieceLabel = (p: Piece) => (p === 'money' && getGoal() ? getGoal()!.name : t(LABEL[p]));

/** 需求拼图面板：亮的块彩色，没亮的是虚线问号；just = 刚刚点亮的块（弹一下） */
export function PuzzleBoard({ pieces, filled, just = [], size = 'md' }: { pieces: Piece[]; filled: Set<Piece>; just?: Piece[]; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'h-14 w-14 text-[11px]' : 'h-[68px] w-[68px] text-xs';
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {pieces.map((p, i) => {
        const on = filled.has(p);
        const pop = just.includes(p);
        return (
          <motion.div
            key={p}
            initial={pop ? { scale: 0, rotate: -40 } : false}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 14, delay: pop ? 0.25 + just.indexOf(p) * 0.35 : 0 }}
            className={`relative flex ${box} flex-col items-center justify-center rounded-2xl font-black ${on ? 'border-b-4 text-white shadow-md' : 'border-2 border-dashed border-slate-300 bg-slate-50 text-slate-300'}`}
            style={on ? { background: COLOR[p], borderColor: 'rgba(0,0,0,.18)' } : undefined}
            aria-label={pieceLabel(p)}
          >
            {on ? <Emoji e={PIECE_EMOJI[p]} size={size === 'sm' ? 22 : 28} /> : <span className="text-xl">?</span>}
            <span className="mt-0.5 leading-none">{pieceLabel(p)}</span>
            {/* 拼图的小凸起 */}
            {i < pieces.length - 1 && <span className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full" style={{ background: on ? COLOR[p] : '#e2e8f0' }} />}
          </motion.div>
        );
      })}
    </div>
  );
}
