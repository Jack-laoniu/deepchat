import type { ReactNode } from 'react';

/**
 * 冒险地图的道具，全部矢量绘制。视角和多邻国 Adventures 一样：从斜上方看下去，
 * 每件东西都能同时看到「顶面」（亮）和「正面」（暗），落地有影子，看起来是立体的。
 *
 * 单位：一格 = 100。每件道具占 w 格宽，画出来 h 格高（底边对齐它站的那一格的底边）。
 */

export type PropKind = 'building' | 'counter' | 'car' | 'sofa' | 'bench' | 'kiosk' | 'desk' | 'shelf' | 'table' | 'bed';
export type DecorKind = 'tree' | 'bush' | 'lamp' | 'bin' | 'flowers' | 'plant' | 'cooler';

export const PROP_SIZE: Record<PropKind | DecorKind, { w: number; h: number }> = {
  building: { w: 2, h: 2.3 },
  counter: { w: 2, h: 1.3 },
  car: { w: 2, h: 1.25 },
  sofa: { w: 2, h: 1.2 },
  bench: { w: 2, h: 1.1 },
  kiosk: { w: 2, h: 2.1 },
  desk: { w: 1, h: 1.45 },
  shelf: { w: 1, h: 2 },
  table: { w: 1, h: 1.1 },
  bed: { w: 2, h: 1.3 },
  tree: { w: 1, h: 2.3 },
  bush: { w: 1, h: 0.85 },
  lamp: { w: 1, h: 2 },
  bin: { w: 1, h: 0.95 },
  flowers: { w: 1, h: 0.6 },
  plant: { w: 1, h: 1.5 },
  cooler: { w: 1, h: 1.6 },
};

/** NPC 站在道具后面（柜台、小摊、书桌后面，只露上半身），其余站在道具前面 */
export const BEHIND: Partial<Record<PropKind, boolean>> = { counter: true, kiosk: true, desk: true };

const LINE = '#3A2A26';
const lw = 3;

/** 一个立体的盒子：顶面 + 正面，左上来光 */
function Box({ x, y, w, top, front, depth, cTop, cFront, r = 8 }: { x: number; y: number; w: number; top: number; front: number; depth?: number; cTop: string; cFront: string; r?: number }) {
  const d = depth ?? top;
  return (
    <g>
      <rect x={x} y={y + d} width={w} height={front} rx={r} fill={cFront} stroke={LINE} strokeWidth={lw} />
      <rect x={x} y={y} width={w} height={d + r} rx={r} fill={cTop} stroke={LINE} strokeWidth={lw} />
      {/* 顶面高光 */}
      <rect x={x + 8} y={y + 5} width={w * 0.45} height={5} rx={2.5} fill="#fff" opacity={0.45} />
    </g>
  );
}

function Svg({ w, h, children }: { w: number; h: number; children: ReactNode }) {
  return (
    <svg viewBox={`-4 -4 ${w * 100 + 8} ${h * 100 + 8}`} width="100%" height="100%" className="overflow-visible">
      {children}
    </svg>
  );
}

export function PropArt({ kind, color }: { kind: PropKind | DecorKind; color?: string }) {
  const { w, h } = PROP_SIZE[kind];
  const H = h * 100;
  switch (kind) {
    case 'building': {
      const c = color ?? '#F3EEE3';
      return (
        <Svg w={w} h={h}>
          {/* 屋顶（顶面） */}
          <rect x={6} y={0} width={188} height={40} rx={8} fill="#8FA3BC" stroke={LINE} strokeWidth={lw} />
          <rect x={14} y={6} width={90} height={6} rx={3} fill="#fff" opacity={0.4} />
          {/* 立面 */}
          <rect x={6} y={34} width={188} height={H - 40} rx={6} fill={c} stroke={LINE} strokeWidth={lw} />
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <rect x={18 + i * 44} y={52} width={30} height={34} rx={4} fill="#9FD3F2" stroke={LINE} strokeWidth={2.5} />
              <path d={`M${21 + i * 44} ${80} l12 -24`} stroke="#fff" strokeWidth={4} opacity={0.6} />
            </g>
          ))}
          {/* 雨棚 + 门 */}
          <path d={`M46 ${H - 96} h108 l8 20 h-124 Z`} fill="#F2665E" stroke={LINE} strokeWidth={lw} strokeLinejoin="round" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <path key={i} d={`M${48 + i * 20} ${H - 96} h10 l3 20 h-11 Z`} fill="#fff" opacity={0.85} />
          ))}
          <rect x={74} y={H - 74} width={52} height={70} rx={4} fill="#7B5A43" stroke={LINE} strokeWidth={lw} />
          <rect x={80} y={H - 68} width={18} height={40} rx={2} fill="#9FD3F2" opacity={0.8} />
          <rect x={102} y={H - 68} width={18} height={40} rx={2} fill="#9FD3F2" opacity={0.8} />
          <rect x={6} y={H - 12} width={188} height={10} rx={3} fill="#000" opacity={0.08} />
        </Svg>
      );
    }
    case 'counter': {
      const c = color ?? '#7EB7E6';
      return (
        <Svg w={w} h={h}>
          <Box x={4} y={36} w={192} top={24} front={64} cTop="#F1D3A6" cFront={c} />
          <rect x={20} y={76} width={160} height={8} rx={4} fill="#fff" opacity={0.45} />
          {/* 收银机放在最边上，不挡站在后面的人 */}
          <rect x={160} y={12} width={36} height={28} rx={5} fill="#5B6B7E" stroke={LINE} strokeWidth={2.5} />
          <rect x={165} y={17} width={26} height={10} rx={2} fill="#B9F0C8" />
          <rect x={6} y={24} width={22} height={18} rx={4} fill="#FFD66B" stroke={LINE} strokeWidth={2.5} />
        </Svg>
      );
    }
    case 'kiosk': {
      const c = color ?? '#C9407A';
      return (
        <Svg w={w} h={h}>
          {/* 两侧立柱 + 菜单板（中间留空，摊主站在里面露出上半身） */}
          <rect x={8} y={40} width={14} height={100} fill="#5C3B53" stroke={LINE} strokeWidth={2.5} />
          <rect x={178} y={40} width={14} height={100} fill="#5C3B53" stroke={LINE} strokeWidth={2.5} />
          <rect x={150} y={58} width={26} height={40} rx={3} fill="#2F2A33" stroke={LINE} strokeWidth={2} />
          {[0, 1, 2].map((i) => (
            <rect key={i} x={154} y={65 + i * 10} width={18} height={4} rx={2} fill="#fff" opacity={0.7} />
          ))}
          {/* 雨棚 */}
          <path d="M0 18 h200 v28 h-200 Z" fill={c} stroke={LINE} strokeWidth={lw} />
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            <path key={i} d={`M${i * 20} 46 a10 10 0 0 0 20 0 Z`} fill={i % 2 ? '#fff' : c} stroke={LINE} strokeWidth={2} />
          ))}
          <rect x={8} y={4} width={184} height={18} rx={6} fill="#E77BA6" stroke={LINE} strokeWidth={lw} />
          {/* 前面的柜台 */}
          <Box x={4} y={120} w={192} top={18} front={64} cTop="#F4E7D4" cFront={c} />
          <rect x={18} y={160} width={164} height={6} rx={3} fill="#fff" opacity={0.4} />
          <circle cx={40} cy={H - 4} r={12} fill="#444" stroke={LINE} strokeWidth={2} />
          <circle cx={160} cy={H - 4} r={12} fill="#444" stroke={LINE} strokeWidth={2} />
        </Svg>
      );
    }
    case 'car': {
      const c = color ?? '#E8453C';
      return (
        <Svg w={w} h={h}>
          <circle cx={36} cy={H - 16} r={16} fill="#2D2D2D" />
          <circle cx={164} cy={H - 16} r={16} fill="#2D2D2D" />
          {/* 车顶（顶面）+ 车身（正面） */}
          <rect x={44} y={8} width={112} height={44} rx={14} fill={c} stroke={LINE} strokeWidth={lw} />
          <rect x={52} y={14} width={50} height={6} rx={3} fill="#fff" opacity={0.45} />
          <path d="M40 48 h120 l16 26 h-152 Z" fill="#AEE0F7" stroke={LINE} strokeWidth={lw} strokeLinejoin="round" />
          <path d="M60 52 l-10 18 M78 52 l-10 18" stroke="#fff" strokeWidth={5} opacity={0.7} />
          <rect x={10} y={70} width={180} height={H - 92} rx={16} fill={c} stroke={LINE} strokeWidth={lw} />
          <rect x={18} y={80} width={34} height={14} rx={7} fill="#FFF3B0" stroke={LINE} strokeWidth={2.5} />
          <rect x={148} y={80} width={34} height={14} rx={7} fill="#FFF3B0" stroke={LINE} strokeWidth={2.5} />
          <rect x={74} y={84} width={52} height={16} rx={4} fill="#fff" stroke={LINE} strokeWidth={2} />
          <rect x={20} y={H - 30} width={160} height={6} rx={3} fill="#000" opacity={0.15} />
        </Svg>
      );
    }
    case 'sofa': {
      const c = color ?? '#6BA4D9';
      return (
        <Svg w={w} h={h}>
          <Box x={14} y={12} w={172} top={16} front={36} cTop="#9CC4EA" cFront={c} r={12} />
          <Box x={30} y={60} w={140} top={14} front={36} cTop="#9CC4EA" cFront={c} r={10} />
          <Box x={2} y={40} w={34} top={12} front={66} cTop="#9CC4EA" cFront={c} r={10} />
          <Box x={164} y={40} w={34} top={12} front={66} cTop="#9CC4EA" cFront={c} r={10} />
          <rect x={52} y={40} width={34} height={26} rx={8} fill="#FFD66B" stroke={LINE} strokeWidth={2.5} transform="rotate(-8 69 53)" />
        </Svg>
      );
    }
    case 'bench':
      return (
        <Svg w={w} h={h}>
          <rect x={20} y={70} width={10} height={36} fill="#5C6670" stroke={LINE} strokeWidth={2} />
          <rect x={170} y={70} width={10} height={36} fill="#5C6670" stroke={LINE} strokeWidth={2} />
          {[0, 1].map((i) => (
            <rect key={i} x={6} y={8 + i * 22} width={188} height={16} rx={5} fill="#C98B4E" stroke={LINE} strokeWidth={lw} />
          ))}
          <Box x={4} y={56} w={192} top={14} front={12} cTop="#E0AC6E" cFront="#B67A40" r={5} />
        </Svg>
      );
    case 'desk':
      return (
        <Svg w={w} h={h}>
          <rect x={2} y={22} width={34} height={28} rx={4} fill="#3F4B5C" stroke={LINE} strokeWidth={lw} />
          <rect x={6} y={26} width={26} height={19} rx={2} fill="#9FD3F2" />
          <rect x={15} y={50} width={8} height={8} fill="#3F4B5C" />
          <Box x={2} y={56} w={96} top={20} front={62} cTop="#E9CFA6" cFront="#B98552" r={6} />
          <rect x={14} y={92} width={36} height={8} rx={4} fill="#7A532E" />
        </Svg>
      );
    case 'shelf':
      return (
        <Svg w={w} h={h}>
          <Box x={4} y={0} w={92} top={12} front={H - 16} cTop="#E0B98A" cFront="#A97445" r={5} />
          {[0, 1, 2].map((row) => (
            <g key={row}>
              <rect x={12} y={30 + row * 54} width={76} height={40} rx={3} fill="#6E4A2A" />
              {[0, 1, 2, 3].map((i) => (
                <rect key={i} x={16 + i * 18} y={36 + row * 54 + (i % 2) * 6} width={13} height={34 - (i % 2) * 6} rx={2} fill={['#F2665E', '#FFD66B', '#7EB7E6', '#8BD18B'][(i + row) % 4]} stroke={LINE} strokeWidth={1.5} />
              ))}
            </g>
          ))}
        </Svg>
      );
    case 'table':
      return (
        <Svg w={w} h={h}>
          <rect x={22} y={60} width={8} height={46} fill="#7A532E" />
          <rect x={70} y={60} width={8} height={46} fill="#7A532E" />
          <Box x={6} y={30} w={88} top={26} front={14} cTop="#F3DDB8" cFront="#C08F5A" r={8} />
          <ellipse cx={50} cy={42} rx={18} ry={8} fill="#fff" stroke={LINE} strokeWidth={2} />
          <circle cx={50} cy={40} r={6} fill="#F2665E" />
        </Svg>
      );
    case 'bed':
      return (
        <Svg w={w} h={h}>
          <rect x={4} y={2} width={192} height={40} rx={10} fill="#B98552" stroke={LINE} strokeWidth={lw} />
          <Box x={8} y={34} w={184} top={56} front={34} cTop="#FFFFFF" cFront="#E3D3C0" r={10} />
          <rect x={20} y={40} width={60} height={22} rx={10} fill="#F4F4F4" stroke={LINE} strokeWidth={2} />
          <rect x={8} y={62} width={184} height={30} rx={8} fill={color ?? '#8BC2EA'} stroke={LINE} strokeWidth={2.5} />
        </Svg>
      );
    case 'tree':
      return (
        <Svg w={w} h={h}>
          <rect x={38} y={150} width={24} height={H - 156} rx={5} fill="#9A6A3F" stroke={LINE} strokeWidth={lw} />
          {/* 方方的树冠，和多邻国一样：顶面亮、正面暗 */}
          <rect x={2} y={8} width={96} height={150} rx={26} fill="#4E9B3A" stroke={LINE} strokeWidth={lw} />
          <rect x={2} y={8} width={96} height={96} rx={26} fill="#6CBF4E" stroke={LINE} strokeWidth={lw} />
          <circle cx={30} cy={36} r={9} fill="#9EDB7A" opacity={0.8} />
          <circle cx={56} cy={28} r={6} fill="#9EDB7A" opacity={0.8} />
        </Svg>
      );
    case 'bush':
      return (
        <Svg w={w} h={h}>
          <rect x={6} y={10} width={88} height={70} rx={24} fill="#4E9B3A" stroke={LINE} strokeWidth={lw} />
          <rect x={6} y={10} width={88} height={40} rx={20} fill="#6CBF4E" stroke={LINE} strokeWidth={lw} />
          <circle cx={30} cy={24} r={6} fill="#9EDB7A" />
        </Svg>
      );
    case 'lamp':
      return (
        <Svg w={w} h={h}>
          <rect x={44} y={40} width={12} height={H - 48} fill="#3F4B5C" stroke={LINE} strokeWidth={2} />
          <rect x={34} y={H - 18} width={32} height={12} rx={4} fill="#3F4B5C" stroke={LINE} strokeWidth={2} />
          <rect x={30} y={10} width={40} height={36} rx={8} fill="#FFF3B0" stroke={LINE} strokeWidth={lw} />
          <rect x={26} y={4} width={48} height={12} rx={5} fill="#3F4B5C" stroke={LINE} strokeWidth={2} />
        </Svg>
      );
    case 'bin':
      return (
        <Svg w={w} h={h}>
          <rect x={22} y={14} width={56} height={H - 20} rx={10} fill="#5C6670" stroke={LINE} strokeWidth={lw} />
          <ellipse cx={50} cy={16} rx={28} ry={10} fill="#3F4750" stroke={LINE} strokeWidth={lw} />
          {[0, 1, 2].map((i) => (
            <rect key={i} x={32 + i * 13} y={34} width={5} height={H - 52} rx={2.5} fill="#fff" opacity={0.25} />
          ))}
        </Svg>
      );
    case 'flowers':
      return (
        <Svg w={w} h={h}>
          <rect x={6} y={26} width={88} height={30} rx={10} fill="#8A5A36" stroke={LINE} strokeWidth={lw} />
          {[18, 40, 62, 82].map((x, i) => (
            <circle key={x} cx={x} cy={22 + (i % 2) * 6} r={9} fill={['#F2665E', '#FFD66B', '#E77BA6', '#fff'][i]} stroke={LINE} strokeWidth={2} />
          ))}
        </Svg>
      );
    case 'plant':
      return (
        <Svg w={w} h={h}>
          <path d="M30 100 h40 l-6 46 h-28 Z" fill="#D9774A" stroke={LINE} strokeWidth={lw} strokeLinejoin="round" />
          {[-40, -15, 15, 40].map((a) => (
            <ellipse key={a} cx={50} cy={60} rx={14} ry={40} fill="#5DAE45" stroke={LINE} strokeWidth={2.5} transform={`rotate(${a} 50 100)`} />
          ))}
        </Svg>
      );
    case 'cooler':
      return (
        <Svg w={w} h={h}>
          <rect x={26} y={8} width={48} height={50} rx={14} fill="#AEE0F7" stroke={LINE} strokeWidth={lw} />
          <Box x={20} y={54} w={60} top={10} front={H - 70} cTop="#F4F4F4" cFront="#DADFE5" r={6} />
          <rect x={40} y={86} width={20} height={8} rx={3} fill="#5C6670" />
        </Svg>
      );
  }
}
