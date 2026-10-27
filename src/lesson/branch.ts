import { asksOf, type AskBeat, type Lesson, type MapRound, type Round } from './schema';

/**
 * 「自己的路线」：开场问最想干啥时，用户没点现成的方向，而是用自己的话说了一个（比如一个我们没写过的景点）。
 * 这时写好的几个版本的场景（free.branch）都不合适：先放一个占位（第一个版本的副本），后台让模型按用户原话现写一个新场景换掉它。
 * 新场景的 id 是 own_ + 第一个版本的 id，只在 free.set 的标记下出现；原来的几个版本在这个标记下都不出现。
 */
export type Branch = { ask: AskBeat; base: MapRound; ids: string[]; flag: string; ownId: string };

export function branchOf(lesson: Lesson): Branch | null {
  for (const r of lesson.rounds) {
    for (const ask of asksOf(r)) {
      const ids = ask.free?.branch ?? [];
      const flag = ask.free?.set[0];
      const base = lesson.rounds.find((x): x is MapRound => x.id === ids[0] && x.type === 'map');
      if (base && flag) return { ask, base, ids, flag, ownId: `own_${base.id}` };
    }
  }
  return null;
}

/** 放进用户自己的场景（没给就先用第一个版本的副本占位）；原来的几个版本在这个标记下都不出现 */
export function withOwnScene(lesson: Lesson, scene?: MapRound): Lesson {
  const b = branchOf(lesson);
  if (!b) return lesson;
  const own: MapRound = { ...(scene ?? b.base), id: b.ownId, if: { all: [b.flag] } };
  const hide = (r: Round): Round => {
    if (!b.ids.includes(r.id)) return r;
    const none = r.if?.none ?? [];
    return none.includes(b.flag) ? r : { ...r, if: { ...r.if, none: [...none, b.flag] } };
  };
  const rest = lesson.rounds.filter((r) => r.id !== b.ownId).map(hide);
  const at = rest.findIndex((r) => r.id === b.ids[0]);
  return { ...lesson, rounds: [...rest.slice(0, at), own, ...rest.slice(at)] };
}
