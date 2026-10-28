import type { Played } from './engine';
import type { Lesson, Round } from './schema';

/**
 * 需求拼图（取代血条）：闯关的目标不是「别死」，而是把自己的需求画像拼完整。
 * 每一类小游戏点亮一块；一关里有哪些块，由这一关有哪些回合决定。
 */
export const PIECES = ['why', 'money', 'life', 'priority', 'tradeoff', 'risk', 'direction', 'data'] as const;
export type Piece = (typeof PIECES)[number];

export const PIECE_EMOJI: Record<Piece, string> = {
  why: '💭',
  money: '💰',
  life: '🏠',
  priority: '⭐',
  tradeoff: '⚖️',
  risk: '🕳️',
  direction: '🧭',
  data: '📎',
};

/** 这个回合能点亮哪几块 */
export function piecesOf(r: Round): Piece[] {
  switch (r.type) {
    case 'talk':
    case 'map':
      return ['why'];
    case 'slider':
      return r.kind === 'budget' ? ['money'] : ['priority'];
    case 'day':
    case 'place':
      return ['life'];
    case 'sort':
    case 'pick':
    case 'swipe':
      return ['priority'];
    case 'trip':
      return ['life'];
    case 'chain':
      return ['tradeoff'];
    case 'fix':
      return ['risk'];
    case 'boss':
      return r.bring.length ? ['direction', 'data'] : ['direction'];
  }
}

/**
 * 这一关的拼图有哪些块（按固定顺序）。带条件（if）的回合不一定会出现，只有真的玩到了才算进来，
 * 否则那一块永远点不亮、拼图永远凑不满。
 */
export function puzzleOf(lesson: Lesson, played?: Played): Piece[] {
  const visited = new Set(played?.visited ?? []);
  const have = new Set(lesson.rounds.filter((r) => !r.if || visited.has(r.id)).flatMap(piecesOf));
  return PIECES.filter((p) => have.has(p));
}

/** 已经点亮的块 */
export function filledOf(lesson: Lesson, played: Played): Set<Piece> {
  const byId = new Map(lesson.rounds.map((r) => [r.id, r]));
  return new Set(played.visited.flatMap((id) => (byId.get(id) ? piecesOf(byId.get(id)!) : [])));
}
