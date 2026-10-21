import { useEffect, useState } from 'react';

/** 服务端有没有配 API key（网页版能不能在线生成） */
export function useCanGenerate() {
  const [cfg, setCfg] = useState<{ generate: boolean; needCode: boolean } | null>(null);
  useEffect(() => {
    fetch('/api/config')
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: { generate?: boolean; needCode?: boolean }) => setCfg({ generate: !!d.generate, needCode: !!d.needCode }))
      .catch(() => setCfg({ generate: false, needCode: false }));
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
