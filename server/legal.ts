import privacyMd from '../docs/privacy.md?raw';
import termsMd from '../docs/terms.md?raw';
import type { Config } from './config';

/**
 * 隐私政策 /privacy 和用户协议 /terms：上架 ChatGPT、Claude 目录都要求有公开地址。
 * 正文在 docs/*.md，里面的 {{占位符}} 用配置文件的 legal 一节填（改完立即生效）。
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s: string) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/(https?:\/\/[^\s<）)]+)/g, '<a href="$1">$1</a>');

/** 只认这两份文档用到的 Markdown：标题、段落、列表、表格、分隔线 */
export function markdownToHtml(md: string): string {
  const out: string[] = [];
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = /^(#{1,3}) (.*)$/.exec(line);
    if (h) out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
    else if (line.trim() === '---') out.push('<hr>');
    else if (line.startsWith('|')) {
      const rows: string[][] = [];
      for (; i < lines.length && lines[i].startsWith('|'); i++)
        if (!/^\|[\s|:-]+\|$/.test(lines[i])) rows.push(lines[i].slice(1, -1).split('|').map((c) => c.trim()));
      i--;
      const [head, ...body] = rows;
      out.push(`<table><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</table>`);
    } else if (/^(- |\d+\. )/.test(line)) {
      const ordered = /^\d/.test(line);
      const items: string[] = [];
      for (; i < lines.length && /^(- |\d+\. )/.test(lines[i]); i++) items.push(`<li>${inline(lines[i].replace(/^(- |\d+\. )/, ''))}</li>`);
      i--;
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
    } else if (line.trim()) {
      const para: string[] = [];
      for (; i < lines.length && lines[i].trim() && !/^(#|\||- |\d+\. |---)/.test(lines[i]); i++) para.push(inline(lines[i]));
      i--;
      out.push(`<p>${para.join('<br>')}</p>`);
    }
  }
  return out.join('\n');
}

/** 网页版实际用的模型服务商，写进隐私政策 */
export function providerNames(config: Config): string {
  if (config.legal?.providers) return config.legal.providers;
  const names = new Set<string>();
  const anthropic = !!config.anthropic?.apiKey && config.provider !== 'openai';
  const openai = !!config.openai?.apiKey && (config.provider === 'openai' || !anthropic);
  if (anthropic) names.add('Anthropic（Claude）');
  if (openai || (config.tts?.enabled && !config.tts.baseUrl)) {
    const url = config.openai?.baseUrl || 'https://api.openai.com/v1';
    names.add(/deepseek/.test(url) ? 'DeepSeek（深度求索）' : /openai\.com/.test(url) ? 'OpenAI' : `OpenAI 兼容接口服务商（${new URL(url).host}）`);
  }
  if (config.tts?.enabled && config.tts.baseUrl) names.add(`语音合成服务（${new URL(config.tts.baseUrl).host}）`);
  return [...names].join('、') || '（网页版暂未开启在线生成）';
}

export function legalPage(which: 'privacy' | 'terms', config: Config, site: string): string {
  const l = config.legal ?? {};
  const fill: Record<string, string> = {
    EFFECTIVE_DATE: l.effectiveDate || '（待填写）',
    OPERATOR: l.operator || '（待填写）',
    CONTACT: l.contact || '（待填写）',
    JURISDICTION: l.jurisdiction || '中华人民共和国法律',
    SITE: site,
    PROVIDERS: providerNames(config),
  };
  const md = (which === 'privacy' ? privacyMd : termsMd).replace(/\{\{(\w+)\}\}/g, (m, k: string) => fill[k] ?? m);
  const title = which === 'privacy' ? '隐私政策 · Privacy Policy' : '用户协议 · Terms of Use';
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>需求闯关 ${title}</title>
<style>body{max-width:760px;margin:0 auto;padding:24px 16px 64px;font:16px/1.7 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#1e293b;background:#fff}h1{font-size:1.6em}h2{font-size:1.2em;margin-top:2em}table{border-collapse:collapse;width:100%;font-size:14px;display:block;overflow-x:auto}th,td{border:1px solid #e2e8f0;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f8fafc}code{background:#f1f5f9;padding:0 4px;border-radius:4px}hr{margin:3em 0;border:0;border-top:1px solid #e2e8f0}a{color:#e11d48}nav{font-size:14px;margin-bottom:1em}
@media (prefers-color-scheme:dark){body{background:#0f172a;color:#e2e8f0}th{background:#1e293b}th,td{border-color:#334155}code{background:#1e293b}hr{border-top-color:#334155}}</style></head>
<body><nav><a href="/">← 需求闯关</a> · <a href="/privacy">隐私政策</a> · <a href="/terms">用户协议</a></nav>
${markdownToHtml(md)}</body></html>`;
}
