import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { sfx } from '../fx/fx';
import { useGame } from '../game';
import { matches } from '../lesson/engine';
import { t } from '../i18n';
import type { PlaceRound } from '../lesson/schema';
import { centerIn, useBursts } from '../ui/Burst';
import { Emoji } from '../ui/Emoji';
import { HandHint, useHintPath } from '../ui/Hint';
import { Btn } from '../ui/kit';
import { Backdrop, SceneLife } from '../ui/Scene';

const SHADOW = 'drop-shadow(3px 6px 3px rgba(30,20,10,.35))';

/**
 * 摆进生活：从搬家纸箱里把东西拖到场景里你会放的地方。
 * 手感：拿起抬高、目标位置发光、落下时压扁回弹 + 闷响 + 灰尘 + ✓；放错位置 ✕ + 嗡嗡 + 晃动 + 提醒；
 * 全摆好后「咔嚓」拍一张拍立得。
 */
export function Place({ round }: { round: PlaceRound }) {
  const g = useGame();
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [warn, setWarn] = useState<{ zone: string; text: string } | null>(null);
  const [landed, setLanded] = useState<{ zone: string; bad: boolean; key: number } | null>(null);
  const [photo, setPhoto] = useState(false);
  const [sent, setSent] = useState(false);
  const zoneRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const thingRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const box = useRef<HTMLDivElement>(null);
  const { fire, layer } = useBursts();
  const left = round.things.filter((th) => !placed[th.id]);
  // 前面的回答决定某些位置用不了（比如没有固定车位）
  const locked = new Set(round.zones.filter((z) => z.lockIf && matches(z.lockIf, g.played!.flags)).map((z) => z.id));
  const done = left.length === 0;
  const touched = Object.keys(placed).length > 0 || picked !== null;

  // 全部摆好：闪光 + 快门，拍一张「你的生活」
  useEffect(() => {
    if (!done) return setPhoto(false);
    const id = setTimeout(() => {
      sfx.shutter();
      setPhoto(true);
      setTimeout(() => sfx.chime(), 300);
    }, 650);
    return () => clearTimeout(id);
  }, [done]);

  const zoneAt = (x: number, y: number) =>
    round.zones.find((z) => {
      if (locked.has(z.id)) return false;
      const r = zoneRefs.current[z.id]?.getBoundingClientRect();
      return r && x >= r.left - 20 && x <= r.right + 20 && y >= r.top - 30 && y <= r.bottom + 16;
    })?.id ?? null;

  const put = (thingId: string, zoneId: string) => {
    const z = round.zones.find((x) => x.id === zoneId)!;
    if (locked.has(zoneId)) {
      sfx.buzz();
      setWarn({ zone: zoneId, text: z.lockNote || t('placeLocked') });
      setTimeout(() => setWarn((w) => (w?.zone === zoneId ? null : w)), 2800);
      return;
    }
    const bad = z.bad.includes(thingId);
    setPlaced((p) => ({ ...p, [thingId]: zoneId }));
    setPicked(null);
    setOver(null);
    setLanded({ zone: zoneId, bad, key: Date.now() });
    // 落地那一下（东西从上面掉下来需要一点时间）
    setTimeout(() => {
      const at = centerIn(box.current, zoneRefs.current[zoneId]);
      if (bad) {
        sfx.thud();
        setTimeout(() => sfx.buzz(), 90);
        setWarn({ zone: zoneId, text: z.warn });
        setTimeout(() => setWarn((w) => (w?.zone === zoneId ? null : w)), 2800);
        if (at) fire(at.x, at.y - 10, { colors: ['#94a3b8', '#cbd5e1', '#e2e8f0'], stars: false });
      } else {
        sfx.thud();
        setTimeout(() => sfx.drop(Object.keys(placed).length), 60);
        if (at) fire(at.x, at.y - 10, { colors: ['#d6c3a5', '#e7dccb', '#facc15', '#22c55e'], text: `✓ ${z.label}`, textColor: '#16a34a' });
      }
    }, 230);
  };

  const takeBack = (thingId: string) => {
    sfx.lift();
    setPlaced(({ [thingId]: _, ...rest }) => rest);
  };

  // 示范：从纸箱里第一个东西拖到第一个合适的位置
  const demoThing = left[0];
  const demoZone = round.zones.find((z) => !locked.has(z.id) && (!demoThing || !z.bad.includes(demoThing.id))) ?? round.zones[0];
  const path = useHintPath(box, () => (demoThing ? thingRefs.current[demoThing.id] : null), () => zoneRefs.current[demoZone.id], [demoThing?.id, demoZone.id]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-center gap-2">
        <Emoji e={round.emoji} size={30} />
        <h2 className="text-2xl font-black text-slate-700">{round.title}</h2>
      </div>

      {/* 场景和纸箱在同一个容器里：示范手势、彩屑盖在两者上面，不会被裁掉 */}
      <div ref={box} className="relative flex flex-1 flex-col">
        <div className="relative flex-1 rounded-[28px] border-2 border-b-[6px] border-slate-300" style={{ overflow: 'clip' }}>
          <Backdrop kind={round.scene} />
          <SceneLife kind={round.scene} />
          {round.zones.map((z) => {
            const here = round.things.filter((th) => placed[th.id] === z.id);
            const shaking = warn?.zone === z.id;
            const hot = over === z.id;
            const isLocked = locked.has(z.id);
            const justLanded = landed?.zone === z.id;
            return (
              <motion.div
                key={z.id}
                data-zone={z.id}
                ref={(el) => (zoneRefs.current[z.id] = el)}
                onClick={() => picked && put(picked, z.id)}
                className={`absolute z-[3] flex flex-col items-center ${picked ? 'cursor-pointer' : ''} ${isLocked ? 'grayscale' : ''}`}
                style={{ left: `${z.x}%`, top: `${z.y}%`, marginLeft: -48, width: 96 }}
                animate={shaking ? { x: [0, -9, 9, -6, 6, 0] } : { scale: hot ? 1.15 : picked && !isLocked ? [1, 1.06, 1] : 1, opacity: isLocked ? 0.75 : 1 }}
                transition={shaking ? { duration: 0.5 } : picked && !hot && !isLocked ? { repeat: Infinity, duration: 1.1 } : { duration: 0.2 }}
              >
                {/* 地上的位置：亮面在左上；可放时发光 */}
                <div
                  className={`relative flex h-14 w-24 items-center justify-center rounded-[50%] border-[3px] border-dashed ${hot ? 'border-amber-300' : picked ? 'border-white' : 'border-white/70'}`}
                  style={{
                    background: hot ? 'radial-gradient(70% 90% at 35% 30%, rgba(255,250,200,.95), rgba(255,220,120,.45))' : 'radial-gradient(70% 90% at 35% 30%, rgba(255,255,255,.6), rgba(255,255,255,.18))',
                    boxShadow: `3px 6px 8px rgba(30,20,10,.25)${hot ? ', 0 0 18px 6px rgba(255,220,120,.8)' : ''}`,
                  }}
                >
                  {here.length ? (
                    <div className="flex -space-x-3">
                      {here.map((th) => (
                        <motion.button
                          key={th.id}
                          initial={{ y: -120, scale: 0.7 }}
                          animate={{ y: -18, scale: 1, scaleY: justLanded ? [1, 0.7, 1.1, 1] : 1 }}
                          transition={{ y: { type: 'spring', stiffness: 420, damping: 16 }, scaleY: { delay: 0.2, duration: 0.35 } }}
                          onClick={(e) => {
                            e.stopPropagation();
                            takeBack(th.id);
                          }}
                          style={{ filter: SHADOW, originY: 1 }}
                          aria-label={th.label}
                        >
                          <Emoji e={th.emoji} size={here.length > 1 ? 40 : 52} />
                        </motion.button>
                      ))}
                    </div>
                  ) : (
                    <span className="relative opacity-80">
                      <Emoji e={z.emoji} size={30} />
                      {isLocked && (
                        <span className="absolute -right-4 -top-3">
                          <Emoji e="🔒" size={22} />
                        </span>
                      )}
                    </span>
                  )}
                  {/* 放错：红色 ✕ 冒一下 */}
                  <AnimatePresence>
                    {justLanded && landed.bad && (
                      <motion.span key={landed.key} className="absolute -right-2 -top-6" initial={{ scale: 0 }} animate={{ scale: [0, 1.4, 1] }} exit={{ opacity: 0 }} transition={{ delay: 0.25 }}>
                        <Emoji e="❌" size={26} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
                <span className="mt-0.5 whitespace-nowrap rounded-full bg-white/95 px-2 py-0.5 text-sm font-black text-slate-700 shadow-md">{z.label}</span>
                <AnimatePresence>
                  {shaking && warn.text && (
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.8 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute -top-14 z-20 w-max max-w-[180px] rounded-xl border-2 border-rose-300 bg-rose-50 px-2 py-1 text-center text-xs font-black text-rose-700 shadow-lg"
                    >
                      ⚠️ {warn.text}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}

          {/* 拍立得：全摆好后「咔嚓」 */}
          <AnimatePresence>
            {photo && (
              <>
                <motion.div className="pointer-events-none absolute inset-0 z-30 bg-white" initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} transition={{ duration: 0.5 }} />
                <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center">
                  <motion.div initial={{ y: 60, rotate: -12, opacity: 0 }} animate={{ y: 0, rotate: -4, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.2 }} className="rounded-md bg-white px-4 pb-2 pt-2 text-center shadow-2xl">
                    <div className="flex gap-1">
                      {round.things.map((th) => (
                        <Emoji key={th.id} e={th.emoji} size={30} />
                      ))}
                    </div>
                    <div className="mt-1 whitespace-nowrap text-sm font-black text-slate-600">{t('placeDone')}</div>
                  </motion.div>
                </div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* 搬家纸箱：待摆放的东西 */}
        <div className="relative mt-3 rounded-2xl border-2 border-b-4 border-[#b98a5e] px-2 pb-2 pt-4" style={{ background: 'linear-gradient(180deg,#e8c497,#d4a673)' }}>
          <div className="absolute -top-3 left-3 rounded-md bg-[#f6e6cf] px-2 text-xs font-black text-[#8a5a32] shadow">📦 {t('placeBox')}</div>
          <div className="flex min-h-[78px] items-center justify-center gap-2">
            {left.length ? (
              left.map((th) => (
                <motion.button
                  key={th.id}
                  data-thing={th.id}
                  ref={(el) => (thingRefs.current[th.id] = el)}
                  layout
                  drag
                  dragSnapToOrigin
                  onDragStart={() => sfx.lift()}
                  whileDrag={{ scale: 1.25, zIndex: 50, rotate: -4 }}
                  onDrag={(_, info) => setOver(zoneAt(info.point.x - window.scrollX, info.point.y - window.scrollY))}
                  onDragEnd={(_, info) => {
                    const z = zoneAt(info.point.x - window.scrollX, info.point.y - window.scrollY);
                    if (z) put(th.id, z);
                    else setOver(null);
                  }}
                  onTap={() => {
                    if (picked === th.id) return setPicked(null);
                    sfx.lift();
                    setPicked(th.id);
                  }}
                  animate={{ scale: picked === th.id ? 1.12 : 1, y: picked === th.id ? -10 : 0 }}
                  className={`flex w-[78px] touch-none flex-col items-center rounded-xl bg-white py-1.5 shadow-md ${picked === th.id ? 'ring-4 ring-amber-300' : ''}`}
                >
                  <Emoji e={th.emoji} size={40} />
                  <span className="text-center text-[12px] font-extrabold leading-tight text-slate-700">{th.label}</span>
                </motion.button>
              ))
            ) : (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
                <Emoji e="✅" size={36} />
              </motion.span>
            )}
          </div>
        </div>
        {layer}
        {path && <HandHint show={!touched && left.length > 0} mode="drag" from={path.from} to={path.to} delay={1500} />}
      </div>
      <div className="mt-2 text-center text-sm font-black text-amber-700">{left.length ? t('placeHint') : ' '}</div>

      <Btn
        className="mt-1"
        tone={done ? 'green' : 'white'}
        disabled={!done || sent}
        onClick={() => {
          setSent(true);
          g.place(round, placed);
        }}
      >
        {done ? t('confirm') : t('sortLeft', { n: left.length })}
      </Btn>
    </div>
  );
}
