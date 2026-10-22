import { ac, isMuted, onMute, out } from './fx';

/**
 * 背景音乐：全部现场合成（不用音频文件，手机网页秒开）。正式的授权音乐到了可以替换成文件播放。
 *
 * 一首曲子 = 速度 + 每小节一个和弦 + 几条音轨（乐器 + 16 步的节奏型）。
 * 乐器：拨弦（Karplus–Strong，像尤克里里/竖琴）、马林巴、钟琴/八音盒、电钢琴、口哨、铺底和弦、贝斯、鼓。
 * 曲目按 docs/art-brief.md 第 7 节：home / story / explore / tension / day_* / boss，外加 3 段短乐句。
 * 切换曲目会交叉淡入淡出；角色说话时自动压低音量（duck）。
 */

export type Theme = 'home' | 'story' | 'explore' | 'tension' | 'day_morning' | 'day_noon' | 'day_evening' | 'day_night' | 'boss';
type Inst = 'pluck' | 'marimba' | 'bell' | 'keys' | 'whistle' | 'pad' | 'bass' | 'sawbass' | 'lead' | 'kick' | 'snare' | 'hat' | 'shaker' | 'tick';
/** 一条音轨：每小节 16 步；音高写成「和弦里的第几个音」(0,1,2,3=高八度根音) 加八度，或者 null 休止 */
type Track = { inst: Inst; steps: (number | null)[]; octave?: number; vol?: number; len?: number; everyBar?: (bar: number) => boolean };
type Song = { bpm: number; chords: number[][]; tracks: Track[]; vol: number; intro?: boolean };

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
const _ = null;

// 和弦（MIDI 号）
const C = [60, 64, 67], G = [55, 59, 62], Am = [57, 60, 64], F = [53, 57, 60], Dm = [50, 53, 57], Bb = [46, 50, 53], Em = [52, 55, 59], D = [50, 54, 57], E = [52, 56, 59];

const SONGS: Record<Theme, Song> = {
  // 首页：轻快、邀请感。尤克里里扫弦 + 口哨主旋律 + 沙锤
  home: {
    bpm: 100,
    vol: 0.11,
    chords: [C, G, Am, F],
    tracks: [
      { inst: 'pluck', steps: [_, _, 0, _, _, 1, 2, _, _, _, 0, _, 1, _, 2, _], octave: 0, vol: 0.5 },
      { inst: 'whistle', steps: [2, _, _, 1, 2, _, 3, _, _, _, 2, _, 1, _, _, _], octave: 1, vol: 0.18, len: 2, everyBar: (b) => b % 2 === 0 },
      { inst: 'whistle', steps: [1, _, 0, _, 1, _, _, _, 0, _, _, _, _, _, _, _], octave: 1, vol: 0.18, len: 3, everyBar: (b) => b % 2 === 1 },
      { inst: 'bass', steps: [0, _, _, _, _, _, 0, _, 0, _, _, _, _, _, _, _], octave: -2, vol: 0.5 },
      { inst: 'shaker', steps: [1, _, 1, _, 1, _, 1, _, 1, _, 1, _, 1, _, 1, _] },
      { inst: 'kick', steps: [1, _, _, _, _, _, _, _, 1, _, _, _, _, _, _, _], vol: 0.5 },
    ],
  },
  // 剧情 / 聊天：在台词下面，很轻。电钢琴慢琶音 + 铺底
  story: {
    bpm: 84,
    vol: 0.07,
    chords: [F, C, Dm, Bb],
    tracks: [
      { inst: 'pad', steps: [0, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _], octave: -1, len: 16, vol: 0.35 },
      { inst: 'keys', steps: [0, _, _, _, 1, _, _, _, 2, _, _, _, 1, _, _, _], octave: 0, vol: 0.45, len: 4 },
      { inst: 'bass', steps: [0, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _], octave: -2, vol: 0.4, len: 8 },
    ],
  },
  // 探索：好奇、轻松。马林巴固定音型 + 钟琴点缀 + 拨弦贝斯
  explore: {
    bpm: 110,
    vol: 0.1,
    chords: [G, D, Em, C],
    tracks: [
      { inst: 'marimba', steps: [0, _, 2, _, 1, _, 2, _, 0, _, 2, _, 1, _, 3, _], octave: 0, vol: 0.5 },
      { inst: 'bell', steps: [_, _, _, _, _, _, _, _, 3, _, _, _, 2, _, _, _], octave: 1, vol: 0.25, everyBar: (b) => b % 2 === 1 },
      { inst: 'pluck', steps: [0, _, _, _, 0, _, _, _, 0, _, _, _, 0, _, _, _], octave: -2, vol: 0.6 },
      { inst: 'shaker', steps: [_, _, 1, _, _, _, 1, _, _, _, 1, _, _, _, 1, _] },
      { inst: 'kick', steps: [1, _, _, _, _, _, _, _, 1, _, _, _, _, _, _, _], vol: 0.4 },
    ],
  },
  // 取舍：有点悬念。拨弦断奏 + 时钟滴答 + 低音持续
  tension: {
    bpm: 120,
    vol: 0.1,
    chords: [Am, Am, F, E],
    tracks: [
      { inst: 'pluck', steps: [0, _, 0, _, 2, _, 0, _, 1, _, 0, _, 2, _, 1, _], octave: 0, vol: 0.45 },
      { inst: 'pad', steps: [0, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _], octave: -1, len: 16, vol: 0.25 },
      { inst: 'bass', steps: [0, _, _, _, 0, _, _, _, 0, _, _, _, 0, _, _, _], octave: -2, vol: 0.45 },
      { inst: 'tick', steps: [1, _, _, _, 1, _, _, _, 1, _, _, _, 1, _, _, _] },
    ],
  },
  // 一天：同一个主题，四种配器
  day_morning: {
    bpm: 92,
    vol: 0.09,
    chords: [C, F, G, C],
    tracks: [
      { inst: 'whistle', steps: [2, _, _, _, 1, _, 0, _, 1, _, _, _, _, _, _, _], octave: 1, vol: 0.2, len: 3 },
      { inst: 'pluck', steps: [0, _, 1, _, 2, _, 1, _, 0, _, 1, _, 2, _, 1, _], octave: 0, vol: 0.4 },
      { inst: 'bass', steps: [0, _, _, _, _, _, _, _, 0, _, _, _, _, _, _, _], octave: -2, vol: 0.35 },
    ],
  },
  day_noon: {
    bpm: 104,
    vol: 0.1,
    chords: [C, F, G, C],
    tracks: [
      { inst: 'marimba', steps: [0, _, 2, 1, _, 2, 3, _, 0, _, 2, 1, _, 2, 3, _], octave: 0, vol: 0.5 },
      { inst: 'bass', steps: [0, _, _, _, 0, _, _, _, 0, _, _, _, 0, _, _, _], octave: -2, vol: 0.4 },
      { inst: 'shaker', steps: [1, _, 1, _, 1, _, 1, _, 1, _, 1, _, 1, _, 1, _] },
    ],
  },
  day_evening: {
    bpm: 80,
    vol: 0.08,
    chords: [Am, F, C, G],
    tracks: [
      { inst: 'keys', steps: [0, _, _, 1, _, _, 2, _, _, _, 1, _, _, _, _, _], octave: 0, vol: 0.45, len: 4 },
      { inst: 'pad', steps: [0, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _], octave: -1, len: 16, vol: 0.3 },
      { inst: 'bass', steps: [0, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _], octave: -2, vol: 0.35, len: 8 },
    ],
  },
  day_night: {
    bpm: 72,
    vol: 0.08,
    chords: [F, C, Dm, C],
    tracks: [
      { inst: 'bell', steps: [2, _, 1, _, 0, _, 1, _, 2, _, _, _, 3, _, _, _], octave: 1, vol: 0.3 },
      { inst: 'pad', steps: [0, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _], octave: -1, len: 16, vol: 0.3 },
    ],
  },
  // Boss：激昂。底鼓 + 军鼓 + 踩镲、锯齿贝斯、琶音主旋律，开场一小节上冲
  boss: {
    bpm: 150,
    vol: 0.16,
    intro: true,
    chords: [Am, F, C, G],
    tracks: [
      { inst: 'kick', steps: [1, _, _, _, 1, _, _, _, 1, _, 1, _, 1, _, _, _] },
      { inst: 'snare', steps: [_, _, _, _, 1, _, _, _, _, _, _, _, 1, _, _, 1] },
      { inst: 'hat', steps: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
      { inst: 'sawbass', steps: [0, _, 0, _, 0, _, _, 0, _, 0, _, 1, _, 0, 2, _], octave: -2, vol: 0.9 },
      { inst: 'lead', steps: [0, 1, 2, 1, 0, 1, 2, 3, 0, 1, 2, 1, 2, 3, 2, 1], octave: 1, vol: 0.35 },
    ],
  },
};

// ---------------- 乐器 ----------------

/** Karplus–Strong 拨弦：每个音高算一次波形，缓存起来 */
const pluckCache = new Map<number, AudioBuffer>();
function pluckBuffer(a: AudioContext, midi: number): AudioBuffer {
  const hit = pluckCache.get(midi);
  if (hit) return hit;
  const sr = a.sampleRate;
  const len = Math.floor(sr * 1.4);
  const buf = a.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const period = Math.max(2, Math.round(sr / hz(midi)));
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const next = (idx + 1) % period;
    const v = 0.5 * (ring[idx] + ring[next]) * 0.996;
    d[i] = ring[idx];
    ring[idx] = v;
    idx = next;
  }
  pluckCache.set(midi, buf);
  return buf;
}

function env(a: AudioContext, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = a.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0008, t + attack + decay);
  return g;
}

function osc(a: AudioContext, dest: AudioNode, t: number, type: OscillatorType, f: number, peak: number, attack: number, decay: number, detune = 0) {
  const o = a.createOscillator();
  o.type = type;
  o.frequency.value = f;
  o.detune.value = detune;
  const g = env(a, t, peak, attack, decay);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
  return o;
}

function noiseHit(a: AudioContext, dest: AudioNode, t: number, dur: number, peak: number, type: BiquadFilterType, freq: number) {
  const buf = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
  const src = a.createBufferSource();
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = peak;
  src.buffer = buf;
  src.connect(f).connect(g).connect(dest);
  src.start(t);
}

function note(a: AudioContext, dest: AudioNode, inst: Inst, t: number, midi: number, vol: number, dur: number) {
  const f = hz(midi);
  switch (inst) {
    case 'pluck': {
      const src = a.createBufferSource();
      src.buffer = pluckBuffer(a, midi);
      const g = a.createGain();
      g.gain.value = vol * 0.9;
      const lp = a.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      src.connect(lp).connect(g).connect(dest);
      src.start(t);
      return;
    }
    case 'marimba':
      osc(a, dest, t, 'sine', f, vol * 0.6, 0.004, 0.45);
      osc(a, dest, t, 'sine', f * 4, vol * 0.12, 0.002, 0.08);
      noiseHit(a, dest, t, 0.02, vol * 0.15, 'bandpass', f * 3);
      return;
    case 'bell':
      osc(a, dest, t, 'sine', f, vol * 0.5, 0.003, 1.2);
      osc(a, dest, t, 'sine', f * 2.76, vol * 0.15, 0.003, 0.5);
      osc(a, dest, t, 'sine', f * 5.4, vol * 0.05, 0.003, 0.25);
      return;
    case 'keys': {
      // 电钢琴：三角波 + 高八度正弦，慢衰减，过一个低通
      const lp = a.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2200;
      lp.connect(dest);
      osc(a, lp, t, 'triangle', f, vol * 0.5, 0.01, dur + 0.6);
      osc(a, lp, t, 'sine', f * 2, vol * 0.15, 0.01, dur * 0.6 + 0.3);
      return;
    }
    case 'whistle': {
      // 口哨：正弦 + 颤音，起音稍慢
      const o = a.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const lfo = a.createOscillator();
      lfo.frequency.value = 5.5;
      const depth = a.createGain();
      depth.gain.value = f * 0.012;
      lfo.connect(depth).connect(o.frequency);
      const g = a.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.05);
      g.gain.setValueAtTime(vol, t + dur * 0.8);
      g.gain.linearRampToValueAtTime(0, t + dur + 0.08);
      o.connect(g).connect(dest);
      o.start(t);
      lfo.start(t);
      o.stop(t + dur + 0.1);
      lfo.stop(t + dur + 0.1);
      return;
    }
    case 'pad': {
      // 铺底：两个微微走音的锯齿波，过低通，慢起慢收
      const lp = a.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      lp.connect(dest);
      for (const det of [-8, 8]) {
        const o = a.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        const g = a.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol * 0.18, t + dur * 0.3);
        g.gain.linearRampToValueAtTime(0, t + dur + 0.4);
        o.connect(g).connect(lp);
        o.start(t);
        o.stop(t + dur + 0.5);
      }
      return;
    }
    case 'bass':
      osc(a, dest, t, 'triangle', f, vol * 0.6, 0.01, Math.max(0.3, dur));
      osc(a, dest, t, 'sine', f, vol * 0.4, 0.01, Math.max(0.3, dur));
      return;
    case 'sawbass': {
      const lp = a.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(900, t);
      lp.frequency.exponentialRampToValueAtTime(300, t + 0.2);
      lp.connect(dest);
      osc(a, lp, t, 'sawtooth', f, vol * 0.25, 0.005, 0.2);
      return;
    }
    case 'lead': {
      const lp = a.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      lp.connect(dest);
      osc(a, lp, t, 'square', f, vol * 0.13, 0.005, 0.14);
      return;
    }
    case 'kick': {
      const o = a.createOscillator();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      const g = env(a, t, vol, 0.002, 0.3);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + 0.35);
      return;
    }
    case 'snare':
      noiseHit(a, dest, t, 0.16, vol * 0.45, 'bandpass', 1800);
      osc(a, dest, t, 'triangle', 190, vol * 0.15, 0.002, 0.08);
      return;
    case 'hat':
      noiseHit(a, dest, t, 0.04, vol * 0.1, 'highpass', 7000);
      return;
    case 'shaker':
      noiseHit(a, dest, t, 0.05, vol * 0.08, 'highpass', 6000);
      return;
    case 'tick':
      noiseHit(a, dest, t, 0.025, vol * 0.25, 'bandpass', 3000);
      return;
  }
}

// ---------------- 播放器 ----------------

type Playing = { theme: Theme; gain: GainNode; timer: ReturnType<typeof setInterval>; step: number; next: number };
let playing: Playing | null = null;
let wanted: Theme | null = null;
let ducked = false;
const DUCK = 0.35;

function schedule(a: AudioContext, p: Playing) {
  const song = SONGS[p.theme];
  const stepDur = 60 / song.bpm / 4;
  while (p.next < a.currentTime + 0.12) {
    const t = p.next;
    const introBars = song.intro ? 1 : 0;
    const bar = Math.floor(p.step / 16);
    const s = p.step % 16;
    if (bar < introBars) {
      // 开场上冲：噪声扫频 + 渐强的军鼓滚奏
      if (s === 0) {
        const len = stepDur * 16;
        const buf = a.createBuffer(1, Math.floor(a.sampleRate * len), a.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (i / d.length);
        const src = a.createBufferSource();
        const f = a.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.setValueAtTime(300, t);
        f.frequency.exponentialRampToValueAtTime(5000, t + len);
        const g = a.createGain();
        g.gain.value = 0.25;
        src.buffer = buf;
        src.connect(f).connect(g).connect(p.gain);
        src.start(t);
      }
      if (s >= 8) noiseHit(a, p.gain, t, 0.08, 0.15 + s * 0.02, 'bandpass', 1800);
    } else {
      const b = bar - introBars;
      const chord = song.chords[b % song.chords.length];
      for (const tr of song.tracks) {
        if (tr.everyBar && !tr.everyBar(b)) continue;
        const v = tr.steps[s];
        if (v === null || v === undefined) continue;
        const midi = [...chord, chord[0] + 12][v % 4] + 12 * (tr.octave ?? 0);
        note(a, p.gain, tr.inst, t, midi, tr.vol ?? 1, (tr.len ?? 1) * stepDur);
      }
    }
    p.next += stepDur;
    p.step++;
  }
}

function fadeOut(p: Playing) {
  clearInterval(p.timer);
  const a = p.gain.context as AudioContext;
  p.gain.gain.cancelScheduledValues(a.currentTime);
  p.gain.gain.setValueAtTime(p.gain.gain.value, a.currentTime);
  p.gain.gain.linearRampToValueAtTime(0, a.currentTime + 0.8);
  setTimeout(() => p.gain.disconnect(), 1000);
}

/** 切换到某首曲子（同一首则不动）；null = 停止 */
export function playMusic(theme: Theme | null) {
  wanted = theme;
  if (playing?.theme === theme) return;
  if (playing) fadeOut(playing);
  playing = null;
  if (!theme || isMuted()) return;
  const a = ac();
  if (!a) return;
  const song = SONGS[theme];
  const gain = a.createGain();
  gain.gain.setValueAtTime(0, a.currentTime);
  gain.gain.linearRampToValueAtTime(song.vol * (ducked ? DUCK : 1), a.currentTime + 1);
  gain.connect(out(a));
  const p: Playing = { theme, gain, step: 0, next: a.currentTime + 0.05, timer: 0 as unknown as ReturnType<typeof setInterval> };
  p.timer = setInterval(() => schedule(a, p), 25);
  playing = p;
}

export const stopMusic = () => playMusic(null);

/** 角色说话时把音乐压低，说完恢复 */
export function duck(on: boolean) {
  ducked = on;
  if (!playing) return;
  const a = playing.gain.context as AudioContext;
  const target = SONGS[playing.theme].vol * (on ? DUCK : 1);
  playing.gain.gain.cancelScheduledValues(a.currentTime);
  playing.gain.gain.setValueAtTime(playing.gain.gain.value, a.currentTime);
  playing.gain.gain.linearRampToValueAtTime(target, a.currentTime + 0.25);
}

// 静音：停掉；取消静音：接着放该放的那首
onMute((m) => {
  if (m) {
    if (playing) fadeOut(playing);
    playing = null;
  } else if (wanted) {
    const w = wanted;
    wanted = null;
    playMusic(w);
  }
});

// ---------------- 短乐句 ----------------

export const jingle = {
  /** 通关：上行号角 + 收尾和弦 */
  win() {
    const a = ac();
    if (!a) return;
    const t = a.currentTime + 0.05;
    const dest = out(a);
    [60, 64, 67, 72].forEach((m, i) => note(a, dest, 'bell', t + i * 0.12, m + 12, 0.5, 0.2));
    [60, 64, 67, 72].forEach((m) => note(a, dest, 'keys', t + 0.5, m, 0.35, 1.2));
    note(a, dest, 'pluck', t + 0.5, 48, 0.6, 1);
  },
  /** 翻车：滑稽的「哇哦哦」下行 */
  lose() {
    const a = ac();
    if (!a) return;
    const t = a.currentTime + 0.05;
    const dest = out(a);
    [64, 63, 62].forEach((m, i) => {
      const o = a.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(hz(m - 12), t + i * 0.32);
      if (i === 2) o.frequency.linearRampToValueAtTime(hz(m - 14), t + i * 0.32 + 0.6);
      const lp = a.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(400, t + i * 0.32);
      lp.frequency.linearRampToValueAtTime(1200, t + i * 0.32 + 0.12);
      lp.frequency.linearRampToValueAtTime(500, t + i * 0.32 + 0.3);
      const g = env(a, t + i * 0.32, 0.12, 0.03, i === 2 ? 0.7 : 0.28);
      o.connect(lp).connect(g).connect(dest);
      o.start(t + i * 0.32);
      o.stop(t + i * 0.32 + 1);
    });
  },
  /** 完成一个小玩法：短上行琶音 */
  level() {
    const a = ac();
    if (!a) return;
    const t = a.currentTime + 0.02;
    const dest = out(a);
    [67, 71, 74, 79].forEach((m, i) => note(a, dest, 'marimba', t + i * 0.07, m, 0.6, 0.2));
  },
};
