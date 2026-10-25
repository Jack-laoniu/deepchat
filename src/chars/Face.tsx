import { motion } from 'framer-motion';
import type { ComponentProps } from 'react';
import { cameoById } from './cameos';
import { Character } from './Character';

/**
 * 角色的脸：固定角色画出来；客串的名著人物没有画像，用 emoji 圆脸（说话时轻轻跳动）。
 * 对话、舞台、讨论里凡是可能出现客人的地方都用它。
 */
export function Face(props: ComponentProps<typeof Character>) {
  const cameo = cameoById(props.id);
  if (!cameo) return <Character {...props} />;
  const size = props.size ?? 80;
  const d = props.bust ? size : size * 0.7;
  return (
    <motion.span
      className={`flex items-center justify-center rounded-full bg-amber-100 ring-2 ring-amber-200 ${props.bust ? '' : 'mb-3'}`}
      style={{ width: d, height: d, fontSize: d * 0.62, lineHeight: 1 }}
      animate={props.talking ? { y: [0, -4, 0], rotate: [0, -4, 4, 0] } : { y: 0, rotate: 0 }}
      transition={props.talking ? { repeat: Infinity, duration: 0.5 } : {}}
    >
      {cameo.emoji}
    </motion.span>
  );
}
