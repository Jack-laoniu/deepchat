import confetti from 'canvas-confetti';

/** 全部音效用 WebAudio 现场合成，不需要任何音频文件。 */

let ctx: AudioContext | null = null;
let muted = false;
/** 主输出：压缩器（让声音饱满、不爆音）+ 一点混响（不干巴） */
let bus: { in: GainNode; wet: GainNode } | null = null;

export const setMuted = (m: boolean) => {
  muted = m;
  muteListeners.forEach((f) => f(m));
};
export const isMuted = () => muted;
const muteListeners = new Set<(m: boolean) => void>();
export const onMute = (f: (m: boolean) => void) => (muteListeners.add(f), () => muteListeners.delete(f));

/** 生成一段混响冲激（指数衰减的噪声），不用加载音频文件 */
function impulse(a: AudioContext, seconds: number) {
  const len = Math.floor(a.sampleRate * seconds);
  const buf = a.createBuffer(2, len, a.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  return buf;
}

/** 音效和服务器朗读共用的 AudioContext（静音时为 null） */
export function ac(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** 所有音效的入口：经过压缩器，并分一点到混响 */
export function out(a: AudioContext): AudioNode {
  if (!bus) {
    const comp = a.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.connect(a.destination);
    const input = a.createGain();
    input.connect(comp);
    const rev = a.createConvolver();
    rev.buffer = impulse(a, 1.2);
    const wet = a.createGain();
    wet.gain.value = 0.18;
    input.connect(wet).connect(rev).connect(comp);
    bus = { in: input, wet };
  }
  return bus.in;
}

type ToneOpts = { type?: OscillatorType; gain?: number; slideTo?: number; attack?: number };
function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.18, slideTo?: number) {
  play(freq, start, dur, { type, gain, slideTo });
}
function play(freq: number, start: number, dur: number, o: ToneOpts = {}) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.gain ?? 0.18, t + (o.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  osc.connect(g).connect(out(a));
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** 钟/铃：基音 + 不协和泛音，衰减长，「叮」得好听 */
function bell(freq: number, start = 0, gain = 0.12, dur = 0.9) {
  play(freq, start, dur, { gain });
  play(freq * 2.76, start, dur * 0.5, { gain: gain * 0.35 });
  play(freq * 5.4, start, dur * 0.25, { gain: gain * 0.12 });
}

function noise(dur: number, gain = 0.3, o: { start?: number; type?: BiquadFilterType; freq?: number; freqTo?: number; q?: number } = {}) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + (o.start ?? 0);
  const buf = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const src = a.createBufferSource();
  const g = a.createGain();
  const f = a.createBiquadFilter();
  f.type = o.type ?? 'lowpass';
  f.frequency.setValueAtTime(o.freq ?? 900, t);
  if (o.freqTo) f.frequency.exponentialRampToValueAtTime(o.freqTo, t + dur);
  f.Q.value = o.q ?? 0.7;
  g.gain.value = gain;
  src.buffer = buf;
  src.connect(f).connect(g).connect(out(a));
  src.start(t);
}

/** 五声音阶（C 大调），连击时一级级往上走，越放越「爽」 */
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];

/**
 * iPhone 的 Safari 不支持 navigator.vibrate。iOS 18 起，点一下 <input type="checkbox" switch> 的标签
 * 会触发系统的轻触感反馈，这里借它在 iPhone 上「震」一下（必须发生在用户点击的处理过程中）。
 */
function iosTick() {
  try {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    label.style.cssText = 'position:fixed;left:-9999px;opacity:0;pointer-events:none';
    document.body.appendChild(label);
    label.click();
    label.remove();
  } catch {
    /* 不支持就算了 */
  }
}

const vibrate = (p: number | number[]) => {
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(p);
      return;
    }
    // 模式 [震, 停, 震, …] → 在 iPhone 上用几下轻触近似
    const pulses = Array.isArray(p) ? Math.ceil(p.length / 2) : 1;
    iosTick();
    for (let i = 1; i < pulses; i++) setTimeout(iosTick, i * 90);
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
    noise(0.28, 0.25, { type: 'bandpass', freq: 400, freqTo: 2600, q: 1.2 });
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
  /** 拿起：轻轻的「嗖」 */
  lift() {
    play(520, 0, 0.09, { type: 'sine', gain: 0.1, slideTo: 880 });
    vibrate(6);
  },
  /** 放进去：「啵」+ 一声铃，combo 越高音越高 */
  drop(combo = 0) {
    play(900, 0, 0.09, { type: 'sine', gain: 0.22, slideTo: 260 });
    noise(0.03, 0.15, { type: 'highpass', freq: 3000 });
    bell(PENTA[Math.min(combo, PENTA.length - 1)], 0.04, 0.1);
    vibrate(14);
  },
  /** 落地：木头的闷响 */
  thud() {
    play(120, 0, 0.18, { type: 'sine', gain: 0.35, slideTo: 60 });
    noise(0.08, 0.3, { freq: 600 });
    vibrate(18);
  },
  /** 闪光：几个高音随机跳 */
  sparkle() {
    for (let i = 0; i < 4; i++) play(PENTA[5 + Math.floor(Math.random() * 5)] * 1.5, i * 0.045, 0.18, { type: 'triangle', gain: 0.05 });
  },
  /** 放错地方：低沉的「嗡嗡」 */
  buzz() {
    play(220, 0, 0.16, { type: 'square', gain: 0.07, slideTo: 180 });
    play(233, 0, 0.16, { type: 'square', gain: 0.07, slideTo: 190 });
    play(165, 0.17, 0.22, { type: 'square', gain: 0.07, slideTo: 130 });
    vibrate([40, 30, 40]);
  },
  /** 卡片甩出去 */
  swoosh(right = true) {
    noise(0.22, 0.3, { type: 'bandpass', freq: right ? 600 : 2400, freqTo: right ? 2400 : 600, q: 2 });
  },
  /** 槽涨/跌 */
  meter(up: boolean) {
    play(up ? 440 : 520, 0, 0.22, { type: 'triangle', gain: 0.07, slideTo: up ? 760 : 300 });
  },
  /** 心跳：某条槽快见底了 */
  heartbeat() {
    play(70, 0, 0.14, { gain: 0.5, slideTo: 45 });
    play(70, 0.22, 0.14, { gain: 0.35, slideTo: 45 });
    vibrate([30, 120, 30]);
  },
  /** 一组上行琶音：完成一小关 */
  chime() {
    [0, 2, 4, 5].forEach((n, i) => bell(PENTA[n] * 1, i * 0.08, 0.09, 1.1));
  },
  /** 相机快门 */
  shutter() {
    noise(0.05, 0.4, { type: 'highpass', freq: 2000 });
    noise(0.07, 0.3, { start: 0.08, type: 'bandpass', freq: 1200 });
  },
  /** 早上的鸟叫 */
  birds() {
    for (let i = 0; i < 3; i++) {
      const t = i * 0.35 + Math.random() * 0.1;
      play(2400 + Math.random() * 800, t, 0.09, { gain: 0.04, slideTo: 3600 });
      play(3000 + Math.random() * 600, t + 0.11, 0.07, { gain: 0.035, slideTo: 2200 });
    }
  },
  /** 夜里的虫鸣 */
  crickets() {
    for (let i = 0; i < 6; i++) play(4200, i * 0.07, 0.04, { type: 'square', gain: 0.012 });
    for (let i = 0; i < 6; i++) play(4200, 0.8 + i * 0.07, 0.04, { type: 'square', gain: 0.012 });
  },
  /** 时间流逝：时钟滴答 */
  tick(n = 4) {
    for (let i = 0; i < n; i++) noise(0.025, 0.25, { start: i * 0.14, type: 'bandpass', freq: i % 2 ? 2500 : 3200, q: 4 });
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
