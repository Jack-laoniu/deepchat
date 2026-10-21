import qrcode from 'qrcode-generator';
import type { Persona } from '../lesson/persona';
import { svgUrl } from './Emoji';

/**
 * 画分享海报（1080×1920，竖版，正好发朋友圈 / 小红书 / Instagram 快拍）。
 * 内容只有人格、反差、避坑提醒和二维码，不含用户说过的原话。
 */

export interface PosterData {
  persona: Persona;
  /** 当前画面上角色的 SVG 源码（直接抓页面上那个，动作和表情所见即所得） */
  characterSvg: string | null;
  appName: string;
  label: string;
  title: string;
  stats: { emoji: string; text: string }[];
  tipsTitle: string;
  cta: string;
  url: string;
}

const W = 1080;
const H = 1920;
const FONT = '"PingFang SC","Hiragino Sans GB","Noto Sans SC","Microsoft YaHei",system-ui,-apple-system,sans-serif';

function load(src: string, cors = true): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
    setTimeout(() => resolve(null), 4000);
  });
}

/** emoji 优先用 Noto 图（和游戏里一致），拿不到就用系统字体画 */
async function drawEmoji(ctx: CanvasRenderingContext2D, e: string, x: number, y: number, size: number) {
  const img = await load(svgUrl(e));
  if (img) ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  else {
    ctx.font = `${size * 0.85}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(e, x, y);
  }
}

/** 按宽度换行（中文逐字，英文按词） */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const tokens = /[⺀-￯]/.test(text) ? [...text] : text.split(/(?<=\s)/);
  const lines: string[] = [];
  let line = '';
  for (const t of tokens) {
    if (ctx.measureText(line + t).width > maxW && line) {
      lines.push(line.trim());
      line = t;
    } else line += t;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export async function drawPoster(d: PosterData): Promise<Blob | null> {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const [c1, c2] = d.persona.colors;

  // 背景：人格主色渐变 + 左上角的光 + 散落的彩点
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, c1);
  bg.addColorStop(1, c2);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(180, 120, 40, 180, 120, 1100);
  glow.addColorStop(0, 'rgba(255,255,255,.55)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.15 + ((i * 37) % 10) / 30})`;
    const x = (i * 263) % W;
    const y = (i * 491) % 900;
    ctx.beginPath();
    ctx.arc(x, y, 6 + (i % 4) * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText(`${d.appName} · ${d.title}`, W / 2, 110);

  // 角色：脚下一圈影子
  ctx.fillStyle = 'rgba(0,0,0,.15)';
  ctx.beginPath();
  ctx.ellipse(W / 2, 760, 210, 40, 0, 0, Math.PI * 2);
  ctx.fill();
  if (d.characterSvg) {
    const img = await load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(d.characterSvg)}`, false);
    if (img) ctx.drawImage(img, W / 2 - 210, 180, 420, 600);
  }
  await drawEmoji(ctx, d.persona.emoji, W / 2 + 260, 300, 190);

  // 人格卡
  ctx.fillStyle = 'rgba(255,255,255,.95)';
  ctx.shadowColor = 'rgba(0,0,0,.18)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  ctx.font = `800 44px ${FONT}`;
  const cardH = 1160 + 40 + Math.min(2, wrap(ctx, d.persona.twist, W - 300).length) * 56 + 50 - 820;
  roundRect(ctx, 70, 820, W - 140, cardH, 56);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#64748b';
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText(d.label, W / 2, 900);
  ctx.fillStyle = c1;
  ctx.font = `900 120px ${FONT}`;
  ctx.fillText(d.persona.name, W / 2, 1040, W - 200);
  ctx.fillStyle = '#334155';
  ctx.font = `800 48px ${FONT}`;
  ctx.fillText(/[\u4e00-\u9fff\u3040-\u30ff]/.test(d.persona.motto) ? `「${d.persona.motto}」` : `“${d.persona.motto}”`, W / 2, 1120, W - 200);
  // 反差那句，放在一个色块里
  ctx.font = `800 44px ${FONT}`;
  const twist = wrap(ctx, d.persona.twist, W - 300).slice(0, 2);
  const boxH = 40 + twist.length * 56;
  ctx.fillStyle = `${c2}`;
  roundRect(ctx, 130, 1160, W - 260, boxH, 36);
  ctx.fill();
  ctx.fillStyle = '#1e293b';
  twist.forEach((l, i) => ctx.fillText(l, W / 2, 1160 + 20 + 44 + i * 56));

  // 小数据
  ctx.font = `800 40px ${FONT}`;
  const chipW = (W - 140 - 40) / d.stats.length;
  for (const [i, s] of d.stats.entries()) {
    const x = 70 + i * (chipW + 20);
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    roundRect(ctx, x, 1380, chipW, 120, 32);
    ctx.fill();
    await drawEmoji(ctx, s.emoji, x + 60, 1440, 64);
    ctx.fillStyle = '#334155';
    ctx.textAlign = 'left';
    ctx.fillText(s.text, x + 105, 1455, chipW - 120);
    ctx.textAlign = 'center';
  }

  // 底部白卡：避坑提醒（对看到海报的朋友有用）+ 邀请语；右边二维码
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  roundRect(ctx, 70, H - 70 - 250, W - 140 - 250 - 30, 250, 32);
  ctx.fill();
  ctx.textAlign = 'left';
  let ty = H - 70 - 250 + 64;
  if (d.persona.tips.length) {
    ctx.fillStyle = '#64748b';
    ctx.font = `900 36px ${FONT}`;
    ctx.fillText(d.tipsTitle, 100, ty);
    ctx.fillStyle = '#1e293b';
    ctx.font = `800 38px ${FONT}`;
    d.persona.tips.slice(0, 2).forEach((tip, i) => ctx.fillText(`⚠️ ${tip}`, 100, ty + 52 + i * 50, W - 140 - 250 - 90));
    ty += 52 + d.persona.tips.slice(0, 2).length * 50 + 10;
  }
  ctx.fillStyle = c1;
  ctx.font = `900 42px ${FONT}`;
  ctx.fillText(`${d.cta} →`, 100, Math.min(ty + 20, H - 100), W - 140 - 250 - 90);
  ctx.textAlign = 'center';

  // 二维码 + 一句邀请
  const qr = qrcode(0, 'M');
  qr.addData(d.url);
  qr.make();
  const n = qr.getModuleCount();
  const size = 250;
  const cell = size / (n + 4);
  const qx = W - 70 - size;
  const qy = H - 70 - size;
  ctx.fillStyle = '#fff';
  roundRect(ctx, qx, qy, size, size, 24);
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (qr.isDark(r, col)) ctx.fillRect(qx + (col + 2) * cell, qy + (r + 2) * cell, cell + 0.5, cell + 0.5);

  return new Promise((resolve) => {
    try {
      c.toBlob((b) => resolve(b), 'image/png');
    } catch {
      // 跨域图片污染了画布：去掉网络图片重画一遍不现实，直接失败交给调用方降级为文字
      resolve(null);
    }
  });
}
