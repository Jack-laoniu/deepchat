import { AnimatePresence, motion } from 'framer-motion';
import { useRef, useState } from 'react';
import { sfx } from '../fx/fx';
import { useGame } from '../game';
import { t } from '../i18n';
import type { PlaceRound } from '../lesson/schema';
import { Emoji } from '../ui/Emoji';
import { HandHint, useHintPath } from '../ui/Hint';
import { Btn } from '../ui/kit';
import { Backdrop } from '../ui/Scene';

const SHADOW = 'drop-shadow(3px 6px 3px rgba(30,20,10,.35))';

/** 摆进生活：把东西拖到场景里你会放的地方；不合适的位置会晃一下并提醒，可以挪走 */
export function Place({ round }: { round: PlaceRound }) {
  const g = useGame();
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [warn, setWarn] = useState<{ zone: string; text: string } | null>(null);
  const [sent, setSent] = useState(false);
  const zoneRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const thingRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const box = useRef<HTMLDivElement>(null);
  const left = round.things.filter((th) => !placed[th.id]);
  const touched = Object.keys(placed).length > 0 || picked !== null;

  const zoneAt = (x: number, y: number) =>
    round.zones.find((z) => {
      const r = zoneRefs.current[z.id]?.getBoundingClientRect();
      return r && x >= r.left - 16 && x <= r.right + 16 && y >= r.top - 16 && y <= r.bottom + 16;
    })?.id ?? null;

  const put = (thingId: string, zoneId: string) => {
    const z = round.zones.find((x) => x.id === zoneId)!;
    setPlaced((p) => ({ ...p, [thingId]: zoneId }));
    setPicked(null);
    setOver(null);
    if (z.bad.includes(thingId)) {
      sfx.warn();
      setWarn({ zone: zoneId, text: z.warn });
      setTimeout(() => setWarn((w) => (w?.zone === zoneId ? null : w)), 2600);
    } else sfx.coin();
  };

  // 示范：从托盘里第一个东西拖到第一个合适的位置
  const demoThing = left[0];
  const demoZone = round.zones.find((z) => !demoThing || !z.bad.includes(demoThing.id)) ?? round.zones[0];
  const path = useHintPath(box, () => (demoThing ? thingRefs.current[demoThing.id] : null), () => zoneRefs.current[demoZone.id], [demoThing?.id, demoZone.id]);
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-center gap-2">
        <Emoji e={round.emoji} size={30} />
        <h2 className="text-2xl font-black text-slate-700">{round.title}</h2>
      </div>

      {/* 场景：overflow clip 防止动画层把画面挤歪 */}
      {/* 场景和托盘放在同一个容器里，示范手势盖在两者上面，不会被场景裁掉 */}
      <div ref={box} className="relative flex flex-1 flex-col">
      <div className="relative flex-1 rounded-[28px] border-2 border-b-[6px] border-slate-300" style={{ overflow: 'clip' }}>
        <Backdrop kind={round.scene} />
        {round.zones.map((z) => {
          const here = round.things.filter((th) => placed[th.id] === z.id);
          const shaking = warn?.zone === z.id;
          return (
            <motion.div
              key={z.id}
              ref={(el) => (zoneRefs.current[z.id] = el)}
              onClick={() => picked && put(picked, z.id)}
              className="absolute flex flex-col items-center"
              style={{ left: `${z.x}%`, top: `${z.y}%`, marginLeft: -44, width: 88 }}
              animate={shaking ? { x: [0, -8, 8, -5, 5, 0] } : { scale: over === z.id ? 1.12 : 1 }}
              transition={{ duration: shaking ? 0.5 : 0.2 }}
            >
              {/* 地上的位置标记：亮面在左上 */}
              <div
                className={`relative flex h-14 w-[88px] items-center justify-center rounded-[50%] border-2 border-dashed ${over === z.id || picked ? 'border-amber-400' : 'border-white/80'}`}
                style={{ background: 'radial-gradient(70% 90% at 35% 30%, rgba(255,255,255,.55), rgba(255,255,255,.15))', boxShadow: '3px 6px 8px rgba(30,20,10,.25)' }}
              >
                {here.length ? (
                  <div className="flex -space-x-2" style={{ filter: SHADOW }}>
                    {here.map((th) => (
                      <motion.button
                        key={th.id}
                        initial={{ y: -40, scale: 0.5 }}
                        animate={{ y: -14, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 14 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          sfx.tap();
                          setPlaced(({ [th.id]: _, ...rest }) => rest);
                        }}
                        aria-label={th.label}
                      >
                        <Emoji e={th.emoji} size={here.length > 1 ? 36 : 46} />
                      </motion.button>
                    ))}
                  </div>
                ) : (
                  <span className="opacity-80">
                    <Emoji e={z.emoji} size={30} />
                  </span>
                )}
              </div>
              <span className="mt-0.5 whitespace-nowrap rounded-full bg-white/95 px-2 py-0.5 text-sm font-black text-slate-700 shadow-md">{z.label}</span>
              <AnimatePresence>
                {shaking && warn.text && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="absolute -top-12 z-20 w-max max-w-[170px] rounded-xl border-2 border-amber-400 bg-amber-50 px-2 py-1 text-center text-xs font-black text-amber-800 shadow-lg"
                  >
                    ⚠️ {warn.text}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* 待摆放的东西 */}
      <div className="mt-3 flex min-h-[86px] items-center justify-center gap-2">
        {left.length ? (
          left.map((th) => (
            <motion.button
              key={th.id}
              ref={(el) => (thingRefs.current[th.id] = el)}
              layout
              drag
              dragSnapToOrigin
              whileDrag={{ scale: 1.15, zIndex: 50 }}
              onDrag={(_, info) => setOver(zoneAt(info.point.x - window.scrollX, info.point.y - window.scrollY))}
              onDragEnd={(_, info) => {
                const z = zoneAt(info.point.x - window.scrollX, info.point.y - window.scrollY);
                if (z) put(th.id, z);
                else setOver(null);
              }}
              onTap={() => {
                sfx.tap();
                setPicked((p) => (p === th.id ? null : th.id));
              }}
              animate={{ scale: picked === th.id ? 1.1 : 1 }}
              className={`flex w-[76px] touch-none flex-col items-center rounded-2xl border-2 border-b-4 bg-white py-1.5 ${picked === th.id ? 'border-amber-400 ring-4 ring-amber-200' : 'border-slate-200'}`}
            >
              <Emoji e={th.emoji} size={38} />
              <span className="text-center text-[12px] font-extrabold leading-tight text-slate-700">{th.label}</span>
            </motion.button>
          ))
        ) : (
          <span className="text-base font-black text-green-600">✅</span>
        )}
      </div>
      {path && <HandHint show={!touched && left.length > 0} mode="drag" from={path.from} to={path.to} delay={1500} />}
      </div>
      {left.length > 0 && <div className="mb-1 text-center text-base font-black text-amber-700">{t('placeHint')}</div>}

      <Btn
        className="mt-2"
        disabled={left.length > 0 || sent}
        onClick={() => {
          setSent(true);
          g.place(round, placed);
        }}
      >
        {left.length ? t('sortLeft', { n: left.length }) : t('confirm')}
      </Btn>
    </div>
  );
}
