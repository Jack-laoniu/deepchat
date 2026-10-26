import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Character } from '../chars/Character';
import { sfx } from '../fx/fx';
import { useGame } from '../game';
import { inHost } from '../host';
import { t } from '../i18n';
import { persona as computePersona } from '../lesson/persona';
import { yuan } from '../lesson/output';
import { copyText } from '../ui/copy';
import { Btn } from '../ui/kit';
import { drawPoster } from '../ui/poster';

/** 站点地址：网页版用当前域名；嵌在 ChatGPT / Claude 里时用公开地址 */
const PUBLIC_URL = (import.meta.env.VITE_PUBLIC_URL as string | undefined) || 'https://quest.tlkgo.com';
const site = () => (typeof location !== 'undefined' && location.protocol.startsWith('http') && !inHost() ? location.origin : PUBLIC_URL);

/**
 * 分享：一张竖版海报（需求人格 + 反差 + 避坑提醒 + 二维码），以及「让朋友帮我选」的邀请链接。
 * 传播靠三样：晒身份（人格）、有用（避坑）、有回路（二维码 / 邀请朋友来玩同一个需求）。
 */
export function ShareSheet({ onClose }: { onClose: () => void }) {
  const g = useGame();
  const l = g.lesson!;
  const p = g.played!;
  const me = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<{ url: string; blob: Blob } | null>(null);
  const [note, setNote] = useState('');
  const pz = computePersona(l, p, g.crashes, p.sacrificed);
  const traps = l.rounds.filter((r) => r.type === 'fix' && p.visited.includes(r.id)).length;
  const best = ([['😌', t('easy'), p.score.easy], ['🎯', t('good'), p.score.good], ['🛡️', t('safe'), p.score.safe]] as const).slice().sort((a, b) => b[2] - a[2])[0];
  const caption = `${pz.emoji} ${t('shareIAm', { name: pz.name })}「${pz.motto}」\n${pz.twist}\n${t('shareAsk')} ${site()}`;

  useEffect(() => {
    let url = '';
    // 等角色动起来再抓它的 SVG，所见即所得
    const id = setTimeout(async () => {
      const svg = me.current?.querySelector('svg');
      let src: string | null = null;
      if (svg) {
        const clone = svg.cloneNode(true) as SVGSVGElement;
        // 手臂、头这些是用 CSS transform（带旋转中心）动起来的，变成独立图片后 CSS 的旋转中心会丢，
        // 胳膊会转飞。把每个元素此刻真实的变换矩阵写成 SVG 的 transform 属性
        const src0 = [...svg.querySelectorAll<SVGGraphicsElement>('g')];
        const dst0 = [...clone.querySelectorAll<SVGGraphicsElement>('g')];
        src0.forEach((el, i) => {
          const parent = el.parentNode as SVGGraphicsElement | null;
          const m = el.getCTM?.();
          const pm = parent?.getCTM?.();
          if (!m || !pm) return;
          const local = pm.inverse().multiply(m);
          const d = dst0[i];
          d.setAttribute('transform', `matrix(${local.a} ${local.b} ${local.c} ${local.d} ${local.e} ${local.f})`);
          d.style.transform = '';
          d.style.transformOrigin = '';
          d.style.transformBox = '';
        });
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clone.setAttribute('width', '420');
        clone.setAttribute('height', '700');
        src = new XMLSerializer().serializeToString(clone);
      }
      const blob = await drawPoster({
        persona: pz,
        characterSvg: src,
        appName: t('appName'),
        label: t('shareLabel'),
        title: l.title,
        stats: [
          { emoji: '🧾', text: yuan(p.total) },
          // 只放拿得出手的数字：躲过的坑为 0 就换成最高的那项评分
          traps > 0
            ? { emoji: '🕳️', text: t('shareTraps', { n: traps }) }
            : { emoji: best[0], text: `${best[1]} ${best[2]}` },
          { emoji: '💬', text: t('shareSaid', { n: p.quotes.length }) },
        ],
        tipsTitle: t('shareTips'),
        cta: t('shareCta'),
        url: site(),
      });
      if (blob) {
        url = URL.createObjectURL(blob);
        setImg({ url, blob });
      } else setNote(t('sharePosterFail'));
    }, 600);
    return () => {
      clearTimeout(id);
      if (url) URL.revokeObjectURL(url);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sharePoster = async () => {
    sfx.tap();
    if (!img) return;
    const file = new File([img.blob], 'need-quest.png', { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) return void (await navigator.share({ files: [file], text: caption }));
    } catch {
      return; // 用户取消
    }
    // 不能直接分享图片：下载；微信等内置浏览器下载不了，提示长按图片保存
    const a = document.createElement('a');
    a.href = img.url;
    a.download = 'need-quest.png';
    a.click();
    setNote(t('shareLongPress'));
  };


  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50">
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92%] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white px-4 pb-6 pt-3"
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" />
        {/* 用来画进海报的角色（屏幕外） */}
        <div ref={me} className="pointer-events-none absolute -left-[9999px]" aria-hidden>
          <Character id="me" size={120} act="party" mood="happy" />
        </div>
        <div className="flex justify-center">
          {img ? (
            <img src={img.url} alt={pz.name} className="w-[62%] rounded-2xl shadow-xl" />
          ) : (
            <div className="flex aspect-[9/16] w-[62%] animate-pulse items-center justify-center rounded-2xl text-4xl" style={{ background: `linear-gradient(${pz.colors[0]},${pz.colors[1]})` }}>
              {pz.emoji}
            </div>
          )}
        </div>
        <div className="mt-4 space-y-3">
          <Btn onClick={sharePoster} disabled={!img}>{t('sharePoster')}</Btn>
          <button
            onClick={async () => (await copyText(caption)) && setNote(t('shareCopied'))}
            className="w-full text-center text-sm font-extrabold text-slate-400 hover:text-slate-600"
          >
            {t('shareCopyText')}
          </button>
          {note && <div className="text-center text-sm font-black text-amber-700">{note}</div>}
        </div>
      </motion.div>
    </motion.div>
  );
}
