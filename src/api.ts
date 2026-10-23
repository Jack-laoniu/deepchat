import { useEffect, useState } from 'react';
import { getLang, t, type MsgKey } from './i18n';
import { parseLesson, type Lesson } from './lesson/schema';
import { memoryText } from './memory';

export type ServerConfig = { generate: boolean; needCode: boolean; tts: boolean };

/** 服务端有没有配 API key（网页版能不能在线生成）。整页只问一次 */
let configOnce: Promise<ServerConfig> | null = null;
export const serverConfig = () =>
  (configOnce ??= fetch('/api/config')
    .then((r) => (r.ok ? r.json() : {}))
    .then((d: { generate?: boolean; needCode?: boolean; tts?: boolean }) => ({ generate: !!d.generate, needCode: !!d.needCode, tts: !!d.tts }))
    .catch(() => ({ generate: false, needCode: false, tts: false })));

export function useCanGenerate() {
  const [cfg, setCfg] = useState<ServerConfig | null>(null);
  useEffect(() => {
    let alive = true;
    void serverConfig().then((c) => alive && setCfg(c));
    return () => {
      alive = false;
    };
  }, []);
  return cfg;
}

const CODE_KEY = 'need-quest-code';
export const loadCode = () => {
  try {
    return localStorage.getItem(CODE_KEY) ?? '';
  } catch {
    return '';
  }
};
export const saveCode = (c: string) => {
  try {
    localStorage.setItem(CODE_KEY, c);
  } catch {
    /* 隐私模式下存不了，下次重新输入 */
  }
};

const ERRORS: Record<string, MsgKey> = { code: 'genCode', rate_ip: 'genRate', rate_day: 'genRate', busy: 'genBusy' };

/** 在线生成关卡；context = 上一关的结果（再玩一轮时） */
export async function requestLesson(
  need: string,
  opts: { context?: string; avoid?: string[]; signal?: AbortSignal } = {},
): Promise<{ lesson: Lesson } | { error: string }> {
  // 服务器最多花 5 分钟（含备用模型和兜底），这边多等一点再放弃
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 330_000);
  opts.signal?.addEventListener('abort', () => ctrl.abort());
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // memory：这台设备上记住的、用户以前闯过的需求（角色会记得）
      body: JSON.stringify({ need, lang: getLang() === 'en' ? 'en' : 'zh', code: loadCode(), context: opts.context, avoid: opts.avoid, memory: memoryText(need) || undefined }),
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => ({}))) as { lesson?: unknown; error?: string; detail?: string };
    const r = data.lesson ? parseLesson(data.lesson) : null;
    if (r?.ok) return { lesson: r.lesson };
    if (data.error === 'upstream') return { error: t('genUpstream', { d: data.detail ?? '?' }) };
    if (data.error === 'invalid') return { error: t('genInvalid') };
    if (!data.error) return { error: t('genUpstream', { d: `HTTP ${res.status}` }) }; // 代理/网关自己报的错（如超时）
    return { error: t(ERRORS[data.error] ?? 'genFail') };
  } catch {
    return { error: opts.signal?.aborted ? '' : ctrl.signal.aborted ? t('genTimeout') : t('genFail') };
  } finally {
    clearTimeout(timer);
  }
}

/** 角色对用户自己打的字做出回应；失败或超时返回 null（调用方退回预设台词） */
export async function requestReact(input: {
  need: string;
  who: string;
  as?: string;
  q: string;
  options: string[];
  text: string;
  recent: string[];
}): Promise<{ say: string; mood?: string } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch('/api/react', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...input, lang: getLang() === 'en' ? 'en' : 'zh', code: loadCode() }),
      signal: ctrl.signal,
    });
    const d = (await res.json().catch(() => ({}))) as { say?: string; mood?: string };
    return res.ok && d.say ? { say: d.say, mood: d.mood } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
