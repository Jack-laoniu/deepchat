import { ac, isMuted, onMute, out } from './fx';

/**
 * Boss 战背景音乐：现场合成，不用音频文件。
 * 150 BPM，A 小调，Am–F–C–G 循环：底鼓 + 军鼓 + 踩镲、锯齿波贝斯、方波琶音主旋律，开场一小节上冲。
 * 用「提前 0.12 秒排程」的方式驱动，节奏稳、不受页面卡顿影响。
 */

const BPM = 150;
const STEP = 60 / BPM / 4; // 16 分音符
const LOOK = 0.12;

// 每小节一个和弦（根音 MIDI 号），琶音用和弦内音
const CHORDS = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [48, 52, 55], // C
  [55, 59, 62], // G
];
// 贝斯：每小节 16 步，0 = 休止，其余是相对根音的半音
const BASS = [12, 0, 12, 0, 12, 0, 0, 12, 0, 12, 0, 15, 0, 12, 10, 0];
const KICK = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0];
const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1];
const ARP = [0, 1, 2, 1, 0, 1, 2, 3, 0, 1, 2, 1, 2, 3, 2, 1];

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

let timer: ReturnType<typeof setInterval> | null = null;
let master: GainNode | null = null;
let step = 0;
let nextTime = 0;
let unsub: (() => void) | null = null;

function voice(a: AudioContext, dest: AudioNode, t: number, freq: number, dur: number, type: OscillatorType, gain: number, cutoff?: number) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  let node: AudioNode = o;
  if (cutoff) {
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff * 2, t);
    f.frequency.exponentialRampToValueAtTime(cutoff, t + dur);
    o.connect(f);
    node = f;
  }
  node.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function hit(a: AudioContext, dest: AudioNode, t: number, dur: number, gain: number, type: BiquadFilterType, freq: number) {
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
  const src = a.createBufferSource();
  const f = a.createBiquadFilter();
  const g = a.createGain();
  f.type = type;
  f.frequency.value = freq;
  g.gain.value = gain;
  src.buffer = buf;
  src.connect(f).connect(g).connect(dest);
  src.start(t);
}

function kick(a: AudioContext, dest: AudioNode, t: number) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
  g.gain.setValueAtTime(0.9, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + 0.32);
}

function schedule(a: AudioContext) {
  const dest = master!;
  while (nextTime < a.currentTime + LOOK) {
    const t = nextTime;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    if (bar === 0) {
      // 开场：一小节上冲（噪声扫频 + 军鼓滚奏）
      if (s === 0) {
        const len = STEP * 16;
        const buf = a.createBuffer(1, Math.floor(a.sampleRate * len), a.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (i / d.length);
        const src = a.createBufferSource();
        const f = a.createBiquadFilter();
        const g = a.createGain();
        f.type = 'bandpass';
        f.frequency.setValueAtTime(300, t);
        f.frequency.exponentialRampToValueAtTime(5000, t + len);
        g.gain.value = 0.25;
        src.buffer = buf;
        src.connect(f).connect(g).connect(dest);
        src.start(t);
      }
      if (s >= 8) hit(a, dest, t, 0.08, 0.15 + s * 0.02, 'bandpass', 1800);
    } else {
      const chord = CHORDS[(bar - 1) % CHORDS.length];
      const root = chord[0];
      if (KICK[s]) kick(a, dest, t);
      if (SNARE[s]) {
        hit(a, dest, t, 0.16, 0.45, 'bandpass', 1800);
        voice(a, dest, t, 190, 0.08, 'triangle', 0.15);
      }
      hit(a, dest, t, s % 2 ? 0.03 : 0.05, s % 2 ? 0.08 : 0.14, 'highpass', 7000);
      if (BASS[s]) voice(a, dest, t, hz(root - 24 + BASS[s] - 12), STEP * 1.8, 'sawtooth', 0.22, 500);
      const arp = [...chord, chord[0] + 12][ARP[s]];
      voice(a, dest, t, hz(arp + 12), STEP * 0.9, 'square', 0.045, 2400);
      // 每 4 小节最后一拍加一个高音「呼喊」
      if ((bar - 1) % 4 === 3 && s === 12) voice(a, dest, t, hz(root + 24), STEP * 4, 'sawtooth', 0.05, 3000);
    }
    nextTime += STEP;
    step++;
  }
}

export function startBossMusic() {
  if (timer || isMuted()) return;
  const a = ac();
  if (!a) return;
  master = a.createGain();
  master.gain.setValueAtTime(0, a.currentTime);
  master.gain.linearRampToValueAtTime(0.16, a.currentTime + 0.4);
  master.connect(out(a));
  step = 0;
  nextTime = a.currentTime + 0.05;
  timer = setInterval(() => schedule(a), 25);
  unsub = onMute((m) => m && stopMusic());
}

export function stopMusic() {
  if (timer) clearInterval(timer);
  timer = null;
  unsub?.();
  unsub = null;
  const m = master;
  master = null;
  if (m && ctxOf(m)) {
    const a = ctxOf(m)!;
    m.gain.cancelScheduledValues(a.currentTime);
    m.gain.setValueAtTime(m.gain.value, a.currentTime);
    m.gain.linearRampToValueAtTime(0, a.currentTime + 0.6);
    setTimeout(() => m.disconnect(), 800);
  }
}

const ctxOf = (n: AudioNode) => n.context as AudioContext;
