// Tiny Web Audio synth — every sound is generated, no files.
const KEY = 'plantwalk.muted';
let ctx = null;
let master = null;
let muted = false;
try { muted = localStorage.getItem(KEY) === '1'; } catch { /* storage unavailable */ }

export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem(KEY, m ? '1' : '0'); } catch { /* ignore */ }
  if (master) master.gain.value = m ? 0 : 0.9;
}

// Must be called from a user gesture (iOS requirement).
export function unlock() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

function tone(freq, dur, { type = 'sine', vol = 0.2, when = 0, to = null, attack = 0.005 } = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.2, when = 0, freq = 3000, q = 1, type = 'bandpass' } = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + when;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  click() { tone(660, 0.05, { type: 'square', vol: 0.05 }); },
  // "ka-CHING": drawer clack + two bright bells
  cash() {
    noise(0.07, { vol: 0.35, freq: 1800, q: 0.8 });
    noise(0.05, { vol: 0.25, freq: 900, when: 0.07 });
    tone(2093, 0.9, { vol: 0.16, when: 0.1 });
    tone(2637, 0.9, { vol: 0.12, when: 0.1 });
    tone(3136, 0.7, { vol: 0.08, when: 0.16 });
    tone(4186, 0.5, { vol: 0.05, when: 0.16 });
  },
  buzz() {
    tone(140, 0.35, { type: 'sawtooth', vol: 0.18 });
    tone(95, 0.45, { type: 'square', vol: 0.12, when: 0.05 });
  },
  measure() {
    tone(300, 1.0, { type: 'triangle', vol: 0.08, to: 1100 });
    for (let i = 0; i < 8; i++) tone(1200, 0.03, { type: 'square', vol: 0.03, when: i * 0.12 });
  },
  hint() { tone(880, 0.12, { vol: 0.12 }); tone(1175, 0.2, { vol: 0.12, when: 0.12 }); },
  warn() { tone(1000, 0.08, { type: 'square', vol: 0.06 }); },
  end() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, { type: 'triangle', vol: 0.15, when: i * 0.13 }));
  },
};
