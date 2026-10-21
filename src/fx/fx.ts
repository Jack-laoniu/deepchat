import confetti from 'canvas-confetti';

/** 全部音效用 WebAudio 现场合成，不需要任何音频文件。 */

let ctx: AudioContext | null = null;
let muted = false;

export const setMuted = (m: boolean) => (muted = m);
export const isMuted = () => muted;

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.18, slideTo?: number) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, gain = 0.3) {
  const a = ac();
  if (!a) return;
  const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const src = a.createBufferSource();
  const g = a.createGain();
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 900;
  g.gain.value = gain;
  src.buffer = buf;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}

const vibrate = (p: number | number[]) => {
  try {
    navigator.vibrate?.(p);
  } catch {
    /* 不支持就算了 */
  }
};

export const sfx = {
  tap() {
    tone(660, 0, 0.06, 'triangle', 0.12);
    vibrate(8);
  },
  good() {
    tone(784, 0, 0.12, 'triangle');
    tone(1175, 0.09, 0.22, 'triangle');
    vibrate(20);
  },
  warn() {
    tone(440, 0, 0.14, 'square', 0.08);
    tone(330, 0.13, 0.25, 'square', 0.08);
    vibrate([30, 40, 30]);
  },
  coin() {
    tone(1319, 0, 0.07, 'square', 0.06);
    tone(1760, 0.06, 0.16, 'square', 0.06);
  },
  whoosh() {
    tone(300, 0, 0.18, 'sawtooth', 0.04, 900);
  },
  fix() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.06, 0.18, 'triangle', 0.14));
    vibrate(25);
  },
  crash() {
    noise(0.7, 0.45);
    tone(180, 0, 0.5, 'sawtooth', 0.12, 50);
    vibrate([80, 50, 120]);
  },
  win() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.25, 'triangle', 0.14));
    vibrate([30, 30, 30, 30, 60]);
  },
};

export function celebrate() {
  const colors = ['#22c55e', '#facc15', '#38bdf8', '#f472b6', '#fb923c'];
  confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors });
  setTimeout(() => confetti({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0 }, colors }), 250);
  setTimeout(() => confetti({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1 }, colors }), 400);
}

export function sparkle(x: number, y: number) {
  confetti({ particleCount: 30, spread: 360, startVelocity: 18, ticks: 60, scalar: 0.7, origin: { x, y }, colors: ['#facc15', '#fde68a', '#ffffff'] });
}
