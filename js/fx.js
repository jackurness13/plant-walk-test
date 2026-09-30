// Visual effects: confetti, gauges, counters.
import { fmt } from './ars.js';

// ---------------- confetti ----------------
const COLORS = ['#CC0000', '#ff4d4d', '#ffffff', '#f5c518', '#35c46a', '#9aa5b1'];
let canvas, c2d, parts = [], raf = 0;

function sizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function initConfetti(el) {
  canvas = el;
  c2d = canvas.getContext('2d');
  sizeCanvas();
  addEventListener('resize', sizeCanvas);
}

export function confetti(x = innerWidth / 2, y = innerHeight / 2, n = 90) {
  if (!c2d) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 4 + Math.random() * 9;
    parts.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6,
      w: 6 + Math.random() * 6, h: 3 + Math.random() * 5,
      r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      c: COLORS[(Math.random() * COLORS.length) | 0], life: 1,
    });
  }
  if (!raf) raf = requestAnimationFrame(step);
}

function step() {
  c2d.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter((p) => p.life > 0 && p.y < innerHeight + 40);
  for (const p of parts) {
    p.vy += 0.32; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= 0.009;
    c2d.save();
    c2d.globalAlpha = Math.max(0, Math.min(1, p.life * 1.5));
    c2d.translate(p.x, p.y); c2d.rotate(p.r);
    c2d.fillStyle = p.c;
    c2d.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1);
    c2d.restore();
  }
  raf = parts.length ? requestAnimationFrame(step) : 0;
  if (!raf) c2d.clearRect(0, 0, innerWidth, innerHeight);
}

// ---------------- gauge ----------------
// Semicircle dial; needle angle −90° (min) … +90° (max).
export function gaugeSVG(m) {
  const ticks = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (i / 10) * Math.PI;
    const r1 = i % 5 === 0 ? 70 : 76, r2 = 84;
    ticks.push(`<path d="M${(100 + Math.cos(a) * r1).toFixed(1)} ${(100 + Math.sin(a) * r1).toFixed(1)} L${(100 + Math.cos(a) * r2).toFixed(1)} ${(100 + Math.sin(a) * r2).toFixed(1)}" stroke="#cfd6dd" stroke-width="${i % 5 === 0 ? 3 : 1.5}"/>`);
  }
  const arc = (from, to, color) => {
    const a1 = Math.PI + from * Math.PI, a2 = Math.PI + to * Math.PI;
    return `<path d="M${(100 + Math.cos(a1) * 88).toFixed(1)} ${(100 + Math.sin(a1) * 88).toFixed(1)} A88 88 0 0 1 ${(100 + Math.cos(a2) * 88).toFixed(1)} ${(100 + Math.sin(a2) * 88).toFixed(1)}" stroke="${color}" stroke-width="8" fill="none"/>`;
  };
  return `<svg class="gauge" viewBox="0 0 200 116" aria-hidden="true">
    <path d="M12 100 A88 88 0 0 1 188 100" stroke="#2b3036" stroke-width="18" fill="none"/>
    ${arc(0, 0.5, '#35c46a')}${arc(0.5, 0.78, '#f5c518')}${arc(0.78, 1, '#CC0000')}
    ${ticks.join('')}
    <text x="14" y="114" class="g-minmax">${m.min}</text><text x="186" y="114" class="g-minmax" text-anchor="end">${m.max}</text>
    <g class="needle"><path d="M100 100 L97 34 L100 22 L103 34 Z" fill="#ff3b3b"/></g>
    <circle cx="100" cy="100" r="9" fill="#e8ecef"/><circle cx="100" cy="100" r="4" fill="#CC0000"/>
  </svg>`;
}

export function setNeedle(root, m, value, instant = false) {
  const needle = root.querySelector('.needle');
  const frac = Math.max(0, Math.min(1, (value - m.min) / (m.max - m.min)));
  if (instant) needle.style.transition = 'none';
  needle.style.transform = `rotate(${-90 + frac * 180}deg)`;
}

// Count a number up inside an element.
export function countUp(el, to, { dur = 1100, decimals = 0, prefix = '', suffix = '' } = {}) {
  const t0 = performance.now();
  return new Promise((resolve) => {
    const f = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = prefix + fmt(to * e, decimals) + suffix;
      if (k < 1) requestAnimationFrame(f); else resolve();
    };
    requestAnimationFrame(f);
  });
}
