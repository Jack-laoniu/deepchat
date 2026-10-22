import type { Mood } from './library';
import RIG from './rig.json';

/**
 * 手绘角色素材（从角色设定图切出来的透明底 webp，用 scripts/cut_art.py 生成）。
 * 每人 8 张表情头像 face0–7、7 张全身 pose0–6（pose0 = 设定图左边的大全身像，其余是 6 个动作）。
 * 有素材的角色用图，没有的（大刘、阿杰、玩家）继续用矢量小人。
 */

const files = import.meta.glob('./art/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const url = (name: string) => files[`./art/${name}.webp`];

/** 全身姿势：按语义取，没有的回落到 idle */
export type Pose = 'idle' | 'point' | 'greet' | 'think' | 'cheer' | 'worry' | 'walk' | 'angry' | 'sit';

type Def = {
  /** 8 张表情在设定图里的顺序 → 情绪 */
  faces: Partial<Record<Mood | 'talk', number>>;
  poses: Partial<Record<Pose, number>>;
  /** 走路那张图本来朝哪边（要往反方向走时水平翻转） */
  walkFaces?: 'left' | 'right';
};

// 设定图的表情顺序：默认 / 开心 / 生气 / 惊讶 / 难过 / 偷笑 / 思考 / 说话
const STD: Def['faces'] = { neutral: 0, happy: 1, angry: 2, surprised: 3, sad: 4, worried: 4, smug: 5, thinking: 6, talk: 7 };

const DEFS: Record<string, Def> = {
  // 动作：指路 / 打招呼 / 背包 / 思考 / 欢呼 / 担心
  xiaoting: { faces: STD, poses: { idle: 0, point: 1, greet: 2, walk: 3, think: 4, cheer: 5, worry: 6 }, walkFaces: 'left' },
  // 小芳的表情顺序不一样：开心 / 微笑 / 惊讶 / 生气 / 难过 / 调皮 / 思考 / 说话
  xiaofang: {
    faces: { happy: 0, neutral: 1, surprised: 2, angry: 3, sad: 4, worried: 4, smug: 5, thinking: 6, talk: 7 },
    poses: { idle: 0, point: 1, greet: 2, walk: 3, think: 4, cheer: 5, worry: 6 },
    walkFaces: 'left',
  },
  // 指点 / 调整眼镜 / 思考 / 行走 / 查看资料 / 加油
  xiaobei: { faces: STD, poses: { idle: 0, point: 1, greet: 2, think: 3, walk: 4, cheer: 6, worry: 3 }, walkFaces: 'left' },
  // 拍肩膀 / 拎菜篮 / 看手机 / 叉腰 / 担心 / 加油
  ayi: { faces: STD, poses: { idle: 0, point: 1, greet: 1, walk: 2, think: 3, angry: 4, worry: 5, cheer: 6 } },
  // 指路 / 推眼镜 / 看文件 / 加油 / 喝咖啡 / 摊手
  mei: { faces: STD, poses: { idle: 0, point: 1, greet: 2, think: 3, cheer: 4, walk: 5, worry: 6 } },
  // 背手 / 指点 / 呵气吐槽 / 坐下 / 走路 / 摸头
  wang: { faces: STD, poses: { idle: 0, greet: 2, point: 2, angry: 3, think: 3, sit: 4, walk: 5, worry: 6, cheer: 2 }, walkFaces: 'left' },
};

/** 走路骨架：把全身像在胯部（hip，占身高比例）横切，两腿在 split（占宽度比例）竖切，两条腿绕胯部交替摆动 */
export type Rig = { hip: number; split: number; ratio: number };

/** 这个人能做的「小动作」，NPC 闲着时随机挑一个演 */
export const ACTIONS: Pose[] = ['point', 'think', 'cheer', 'worry', 'angry', 'sit'];

export type Art = { face: (m: Mood | 'talk') => string; pose: (p: Pose) => string; has: (p: Pose) => boolean; rig: Rig; walkFaces?: 'left' | 'right' };

const cache = new Map<string, Art | null>();
export function artFor(id: string | undefined): Art | null {
  if (!id) return null;
  if (cache.has(id)) return cache.get(id)!;
  const d = DEFS[id];
  const art: Art | null =
    d && url(`${id}_face0`)
      ? {
          face: (m) => url(`${id}_face${d.faces[m] ?? d.faces.neutral ?? 0}`),
          pose: (p) => url(`${id}_pose${d.poses[p] ?? 0}`),
          has: (p) => d.poses[p] !== undefined,
          rig: (RIG as Record<string, Rig>)[id] ?? { hip: 0.62, split: 0.5, ratio: 0.38 },
          walkFaces: d.walkFaces,
        }
      : null;
  cache.set(id, art);
  return art;
}
