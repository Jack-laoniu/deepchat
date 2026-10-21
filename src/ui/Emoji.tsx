import lottie from 'lottie-web/build/player/lottie_light';
import { useEffect, useRef, useState } from 'react';

/**
 * Google Noto 表情：静态用 emoji.svg（所有 emoji 都有，几 KB），
 * 动起来用 lottie.json（部分 emoji 有，约 30KB）。
 * 大模型生成关卡只写 emoji 字符，就能得到统一风格、会动的插画。
 */

const BASE = 'https://fonts.gstatic.com/s/e/notoemoji/latest';

function codes(e: string): string[] {
  const cps = [...e].map((c) => c.codePointAt(0)!.toString(16));
  return [...new Set([cps.join('_'), cps.filter((c) => c !== 'fe0f').join('_')])];
}

export const svgUrl = (e: string) => `${BASE}/${codes(e)[0]}/emoji.svg`;

const lottieCache = new Map<string, Promise<object | null>>();
function loadLottie(e: string): Promise<object | null> {
  let p = lottieCache.get(e);
  if (!p) {
    p = (async () => {
      for (const cp of codes(e)) {
        try {
          const r = await fetch(`${BASE}/${cp}/lottie.json`);
          if (r.ok) return (await r.json()) as object;
        } catch {
          return null;
        }
      }
      return null;
    })();
    lottieCache.set(e, p);
  }
  return p;
}

/** 预热静态图；动画按需加载 */
export function preload(emojis: string[]) {
  for (const e of new Set(emojis)) new Image().src = svgUrl(e);
}

export function Emoji({
  e,
  size = 64,
  loop = false,
  replay = 0,
  className = '',
}: {
  e: string;
  size?: number;
  /** 一直循环播放（吉祥物、Boss 等主角） */
  loop?: boolean;
  /** 每次改变这个值，播放一遍动画再回到静态图 */
  replay?: number;
  className?: string;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const [imgFailed, setImgFailed] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!loop && !replay) return;
    let alive = true;
    let anim: ReturnType<typeof lottie.loadAnimation> | null = null;
    loadLottie(e).then((data) => {
      if (!alive || !data || !box.current) return;
      anim = lottie.loadAnimation({ container: box.current, renderer: 'svg', loop, autoplay: true, animationData: structuredClone(data) });
      setPlaying(true);
      if (!loop) anim.addEventListener('complete', () => setPlaying(false));
    });
    return () => {
      alive = false;
      anim?.destroy();
      setPlaying(false);
    };
  }, [e, loop, replay]);

  return (
    <span className={`relative inline-block shrink-0 select-none ${className}`} style={{ width: size, height: size }} role="img" aria-label={e}>
      {imgFailed ? (
        <span className="absolute inset-0 flex items-center justify-center leading-none" style={{ fontSize: size * 0.82 }}>
          {e}
        </span>
      ) : (
        <img
          src={svgUrl(e)}
          alt=""
          draggable={false}
          onError={() => setImgFailed(true)}
          className="absolute inset-0 h-full w-full"
          style={{ visibility: playing ? 'hidden' : 'visible' }}
        />
      )}
      <span ref={box} className="absolute inset-0" style={{ visibility: playing ? 'visible' : 'hidden' }} />
    </span>
  );
}
