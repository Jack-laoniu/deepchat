import { useEffect, useRef, useState } from 'react';
import { sfx } from './fx';
import { hush } from './voice';

/** 浏览器能不能录音（没有麦克风权限、部分微信内置浏览器不行） */
export const canRecord = () => typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
const mimeOf = () => (['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'] as const).find((m) => MediaRecorder.isTypeSupported?.(m)) ?? '';

/**
 * 按住说话：start() 开始录，stop(true) 结束并把录音交给 onClip（太短的不算），最长 maxSec 秒自动结束。
 * 打不开麦克风时调 onDenied（改成打字）。组件卸载时自动停掉。
 */
export function useRecorder({ maxSec, onClip, onDenied }: { maxSec: number; onClip: (b: Blob) => void; onDenied: () => void }) {
  const [recording, setRecording] = useState(false);
  const [sec, setSec] = useState(0);
  const rec = useRef<{ r: MediaRecorder; stream: MediaStream; parts: Blob[]; timer: number } | null>(null);
  const cb = useRef({ onClip, onDenied });
  cb.current = { onClip, onDenied };

  const stop = (send: boolean) => {
    const cur = rec.current;
    if (!cur) return;
    rec.current = null;
    clearInterval(cur.timer);
    setRecording(false);
    cur.r.onstop = () => {
      cur.stream.getTracks().forEach((x) => x.stop());
      const blob = new Blob(cur.parts, { type: cur.r.mimeType || 'audio/webm' });
      if (send && blob.size >= 2000) cb.current.onClip(blob);
    };
    cur.r.stop();
  };

  const start = async () => {
    if (rec.current) return;
    hush();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = mimeOf();
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const parts: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && parts.push(e.data);
      r.start();
      sfx.tap();
      setSec(0);
      setRecording(true);
      const t0 = Date.now();
      const timer = window.setInterval(() => {
        const s = (Date.now() - t0) / 1000;
        setSec(s);
        if (s >= maxSec) stop(true);
      }, 200);
      rec.current = { r, stream, parts, timer };
    } catch {
      cb.current.onDenied();
    }
  };

  useEffect(() => () => stop(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  /** 绑到按钮上的按住 / 松开 */
  const hold = {
    onPointerDown: (e: { preventDefault(): void }) => {
      e.preventDefault();
      void start();
    },
    onPointerUp: () => stop(true),
    onPointerLeave: () => rec.current && stop(true),
    onContextMenu: (e: { preventDefault(): void }) => e.preventDefault(),
    style: { touchAction: 'none', WebkitUserSelect: 'none' } as const,
  };
  return { recording, sec, hold };
}
