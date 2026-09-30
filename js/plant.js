// Top-down plant floor, drawn entirely as inline SVG.
// Idle animations use SMIL (<animate>) so they run on iOS Safari & Android Chrome alike.

export const WORLD = { w: 900, h: 1240 };

export const ZONE_RECTS = {
  compressor: { x: 0, y: 0, w: 440, h: 600 },
  boiler: { x: 460, y: 0, w: 440, h: 600 },
  production: { x: 0, y: 620, w: 440, h: 620 },
  warehouse: { x: 460, y: 620, w: 440, h: 620 },
};

// Tap areas (world units ≈ CSS px) — every one is far larger than 44 px.
export const HOTSPOTS = {
  pressure: { x: 32, y: 64, w: 210, h: 136, label: 'Air compressor' },
  intake: { x: 32, y: 214, w: 150, h: 100, label: 'Compressor intake filter' },
  drain: { x: 268, y: 74, w: 132, h: 140, label: 'Air receiver tank' },
  leaks: { x: 20, y: 400, w: 400, h: 84, label: 'Compressed air header' },
  boiler: { x: 488, y: 64, w: 262, h: 130, label: 'Steam boiler' },
  condensate: { x: 754, y: 74, w: 96, h: 120, label: 'Condensate tank' },
  insulation: { x: 530, y: 300, w: 300, h: 72, label: 'Steam line' },
  lighting: { x: 24, y: 676, w: 392, h: 110, label: 'Production lighting' },
  vfd: { x: 36, y: 940, w: 230, h: 140, label: 'Exhaust fan' },
  motor: { x: 24, y: 1118, w: 356, h: 92, label: 'Conveyor and motor' },
  occupancy: { x: 484, y: 676, w: 290, h: 300, label: 'Warehouse aisles' },
  thermostat: { x: 782, y: 760, w: 66, h: 66, label: 'Office thermostat' },
  dock: { x: 590, y: 1140, w: 180, h: 84, label: 'Dock door' },
};

// deterministic pseudo-random so the drawing is identical every load
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const txt = (x, y, s, cls = 'eq-label', extra = '') => `<text x="${x}" y="${y}" class="${cls}" ${extra}>${s}</text>`;
const spin = (cx, cy, dur, dir = 1) =>
  `<animateTransform attributeName="transform" type="rotate" from="0 ${cx} ${cy}" to="${360 * dir} ${cx} ${cy}" dur="${dur}s" repeatCount="indefinite"/>`;

function blades(cx, cy, r, n, dur, color = '#aab4bf') {
  let p = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const a2 = a + 0.55;
    const x1 = cx + Math.cos(a) * r, y1 = cy + Math.sin(a) * r;
    const x2 = cx + Math.cos(a2) * r * 0.95, y2 = cy + Math.sin(a2) * r * 0.95;
    p += `<path d="M${cx} ${cy} L${x1.toFixed(1)} ${y1.toFixed(1)} Q${(cx + Math.cos(a + 0.3) * r * 1.1).toFixed(1)} ${(cy + Math.sin(a + 0.3) * r * 1.1).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)} Z" fill="${color}"/>`;
  }
  return `<g>${p}<circle cx="${cx}" cy="${cy}" r="${r * 0.2}" fill="#2a2f35" stroke="#cfd6dd" stroke-width="2"/>${spin(cx, cy, dur)}</g>`;
}

// hissing compressed-air leak: particles spraying out of a point
function leak(x, y, n, spread) {
  let p = '';
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (rnd() - 0.5) * 1.6 + (i % 2 ? 0 : Math.PI);
    const dist = spread * (0.6 + rnd() * 0.6);
    const dx = (Math.cos(ang) * dist).toFixed(1), dy = (Math.sin(ang) * dist).toFixed(1);
    const dur = (0.5 + rnd() * 0.5).toFixed(2), begin = (-rnd()).toFixed(2);
    p += `<circle cx="${x}" cy="${y}" r="2" fill="#dff3ff">
      <animate attributeName="cx" from="${x}" to="${x + +dx}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
      <animate attributeName="cy" from="${y}" to="${y + +dy}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.95;0.6;0" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
      <animate attributeName="r" values="1.2;2.6;3.6" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
    </circle>`;
  }
  return `<g class="leak">${p}<circle cx="${x}" cy="${y}" r="3.5" fill="#ffffff" opacity=".9"/></g>`;
}

// rising steam / smoke wisps
function wisps(x0, x1, y, n, color, rise = 60) {
  let p = '';
  for (let i = 0; i < n; i++) {
    const x = x0 + ((x1 - x0) * (i + 0.5)) / n + (rnd() - 0.5) * 10;
    const dur = (2 + rnd() * 1.4).toFixed(2), begin = (-rnd() * 3).toFixed(2);
    const sway = ((rnd() - 0.5) * 24).toFixed(1);
    p += `<ellipse cx="${x.toFixed(1)}" cy="${y}" rx="7" ry="5" fill="${color}">
      <animate attributeName="cy" from="${y}" to="${y - rise}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
      <animate attributeName="cx" values="${x.toFixed(1)};${(x + +sway).toFixed(1)}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
      <animate attributeName="rx" values="5;16" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0;0.5;0" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
    </ellipse>`;
  }
  return `<g class="wisps" pointer-events="none" filter="url(#soft)">${p}</g>`;
}

function flicker(i) {
  const pats = ['1;1;0.35;1;1;0.6;1', '1;0.5;1;1;1;1;0.3;1', '1;1;1;0.45;1'];
  return `<animate attributeName="opacity" values="${pats[i % 3]}" dur="${(1.4 + (i % 4) * 0.6).toFixed(1)}s" repeatCount="indefinite"/>`;
}

const hot = (id, kind, inner, overlay = '') => {
  const h = HOTSPOTS[id];
  return `<g class="hot" data-id="${id}" data-kind="${kind}" role="button" tabindex="0" aria-label="${h.label}">
    <rect class="hit" x="${h.x}" y="${h.y}" width="${h.w}" height="${h.h}" rx="12" pointer-events="all"/>
    ${inner}
    <g class="badge" transform="translate(${h.x + h.w - 12} ${h.y + 12})">
      <circle r="15"/><path d="M-7 0 L-2 5 L7 -5" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </g>${overlay}`;
};

function defs() {
  return `<defs>
  <pattern id="floor" width="40" height="40" patternUnits="userSpaceOnUse">
    <rect width="40" height="40" fill="#2b2f34"/><path d="M40 0H0V40" fill="none" stroke="#33383e" stroke-width="1.5"/>
  </pattern>
  <pattern id="hatch" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="16" height="16" fill="#1d1f22"/><rect width="8" height="16" fill="#e0b21b"/>
  </pattern>
  <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c8793"/><stop offset="1" stop-color="#4d5660"/></linearGradient>
  <linearGradient id="boilerG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b22a2a"/><stop offset=".5" stop-color="#8a1c1c"/><stop offset="1" stop-color="#5c1111"/></linearGradient>
  <radialGradient id="tankG" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#9aa6b2"/><stop offset="1" stop-color="#46505a"/></radialGradient>
  <radialGradient id="jacketG" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#f2f4f6"/><stop offset="1" stop-color="#a9b1ba"/></radialGradient>
  <radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff7c2" stop-opacity=".85"/><stop offset="1" stop-color="#fff7c2" stop-opacity="0"/></radialGradient>
  <radialGradient id="t12glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#e9f5c9" stop-opacity=".55"/><stop offset="1" stop-color="#e9f5c9" stop-opacity="0"/></radialGradient>
  <radialGradient id="heat" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff6a1a" stop-opacity=".55"/><stop offset="1" stop-color="#ff6a1a" stop-opacity="0"/></radialGradient>
  <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
  <pattern id="belt" width="20" height="40" patternUnits="userSpaceOnUse">
    <rect width="20" height="40" fill="#24272b"/><rect x="0" width="4" height="40" fill="#3a3f45"/>
    <animateTransform attributeName="patternTransform" type="translate" from="0 0" to="20 0" dur="0.8s" repeatCount="indefinite"/>
  </pattern>
</defs>`;
}

function zonesBase() {
  let s = `<rect width="${WORLD.w}" height="${WORLD.h}" fill="#1b1d20"/>`;
  // walkway between zones
  s += `<path d="M450 0 V${WORLD.h} M0 610 H${WORLD.w}" stroke="#e0b21b" stroke-width="2" stroke-dasharray="14 10" opacity=".55"/>`;
  for (const [id, z] of Object.entries(ZONE_RECTS)) {
    s += `<rect x="${z.x + 3}" y="${z.y + 3}" width="${z.w - 6}" height="${z.h - 6}" rx="6" fill="url(#floor)" stroke="#5d6670" stroke-width="6"/>`;
    s += `<rect x="${z.x + 14}" y="${z.y + 14}" width="6" height="26" fill="#CC0000"/>`;
  }
  // doorways (gaps in walls)
  s += `<g fill="#1b1d20"><rect x="434" y="500" width="32" height="60"/><rect x="434" y="1060" width="32" height="60"/><rect x="180" y="594" width="80" height="32"/><rect x="640" y="594" width="80" height="32"/></g>`;
  s += txt(28, 36, 'COMPRESSOR ROOM', 'zone-label') + txt(488, 36, 'BOILER ROOM', 'zone-label');
  s += txt(28, 656, 'PRODUCTION FLOOR', 'zone-label') + txt(488, 656, 'WAREHOUSE / OFFICE', 'zone-label');
  return s;
}

function compressorRoom() {
  let s = '';
  // decor: dryer + oil drums + floor markings
  s += `<g class="decor"><rect x="268" y="236" width="120" height="66" rx="6" fill="#3b424a" stroke="#262a2f" stroke-width="3"/>
    <rect x="280" y="248" width="40" height="18" rx="2" fill="#11161a"/><circle cx="366" cy="258" r="5" fill="#35c46a"/>
    ${txt(328, 292, 'AIR DRYER', 'decor-label', 'text-anchor="middle"')}
    <circle cx="60" cy="548" r="20" fill="#2f5d8a" stroke="#1d3c5a" stroke-width="3"/><circle cx="104" cy="548" r="20" fill="#2f5d8a" stroke="#1d3c5a" stroke-width="3"/>
    <rect x="300" y="520" width="110" height="46" fill="url(#hatch)" opacity=".7"/></g>`;

  // riser pipe from receiver to header (not part of a hotspot)
  s += `<path d="M388 140 H412 V440" fill="none" stroke="#7f8a96" stroke-width="12" stroke-linejoin="round"/><path d="M388 140 H412 V440" fill="none" stroke="#3d8bd9" stroke-width="3" stroke-dasharray="10 18"/>`;
  s += `<path d="M234 132 H280" stroke="#7f8a96" stroke-width="12"/>`;

  s += hot('pressure', 'finding', `
    <g class="vibrate"><rect x="40" y="72" width="194" height="120" rx="10" fill="url(#steel)" stroke="#262a2f" stroke-width="3"/>
    <rect x="48" y="80" width="80" height="48" rx="4" fill="#0c0e10" stroke="#454c54" stroke-width="2"/>
    <text x="88" y="112" class="led">125</text>${txt(88, 124, 'PSIG', 'led-sub', 'text-anchor="middle"')}
    <circle cx="180" cy="132" r="44" fill="#16191c" stroke="#65707c" stroke-width="4"/>
    ${blades(180, 132, 38, 5, 0.5)}
    <circle cx="180" cy="132" r="44" fill="none" stroke="#8e98a3" stroke-width="1.5" stroke-dasharray="3 5"/>
    ${txt(52, 160, 'SCREW', 'eq-label')}${txt(52, 178, '100 HP', 'eq-label')}</g>`);

  s += hot('intake', 'finding', `
    <circle cx="80" cy="262" r="32" fill="#3a4148" stroke="#20252a" stroke-width="3"/>
    <circle cx="80" cy="262" r="23" fill="none" stroke="#6e7883" stroke-width="5" stroke-dasharray="3 3"/>
    <circle cx="80" cy="262" r="10" fill="#20252a"/>
    <path d="M80 230 V212" stroke="#7f8a96" stroke-width="10"/>
    <g><rect x="130" y="226" width="20" height="72" rx="10" fill="#e8ecef" stroke="#20252a" stroke-width="2"/>
    <rect x="135" y="240" width="10" height="50" rx="5" fill="#e03b24"/><circle cx="140" cy="290" r="9" fill="#e03b24"/></g>
    ${txt(140, 222, '95°F', 'eq-label hotlabel', 'text-anchor="middle"')}
    <g pointer-events="none" stroke="#ff8a4c" stroke-width="2.5" fill="none" opacity=".75">
      <path d="M50 300 q6 -8 0 -16 q-6 -8 0 -16"><animateTransform attributeName="transform" type="translate" values="0 6;0 -8" dur="1.3s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;0" dur="1.3s" repeatCount="indefinite"/></path>
      <path d="M110 300 q6 -8 0 -16 q-6 -8 0 -16"><animateTransform attributeName="transform" type="translate" values="0 6;0 -8" dur="1.6s" begin="-.5s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;0" dur="1.6s" begin="-.5s" repeatCount="indefinite"/></path>
      <path d="M168 300 q6 -8 0 -16 q-6 -8 0 -16"><animateTransform attributeName="transform" type="translate" values="0 6;0 -8" dur="1.4s" begin="-.9s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;0" dur="1.4s" begin="-.9s" repeatCount="indefinite"/></path>
    </g>
    ${txt(60, 306, 'INTAKE', 'eq-label')}`);

  s += hot('drain', 'decoy', `
    <circle cx="334" cy="140" r="56" fill="url(#tankG)" stroke="#262a2f" stroke-width="3"/>
    <circle cx="334" cy="140" r="40" fill="none" stroke="#5d6772" stroke-width="2"/>
    ${txt(334, 136, 'RECEIVER', 'eq-label dark', 'text-anchor="middle"')}${txt(334, 152, '400 GAL', 'eq-label dark small', 'text-anchor="middle"')}
    <rect x="318" y="198" width="32" height="12" rx="3" fill="#20252a"/>
    <circle cx="342" cy="204" r="3.5" fill="#35c46a"><animate attributeName="opacity" values="1;.2;1" dur="2s" repeatCount="indefinite"/></circle>`);

  s += hot('leaks', 'finding', `
    ${txt(34, 422, 'AIR MAIN · 100 PSIG', 'eq-label')}
    <path d="M28 444 H418" stroke="#7f8a96" stroke-width="14" stroke-linecap="round"/>
    <path d="M28 444 H418" stroke="#3d8bd9" stroke-width="3" stroke-dasharray="10 18"/>
    <g stroke="#7f8a96" stroke-width="8"><path d="M70 444 V474"/><path d="M190 444 V474"/><path d="M300 444 V474"/></g>
    <g fill="#c7cfd6"><rect x="62" y="468" width="16" height="10" rx="2"/><rect x="182" y="468" width="16" height="10" rx="2"/><rect x="292" y="468" width="16" height="10" rx="2"/></g>
    ${leak(118, 444, 5, 16)}${leak(236, 444, 8, 22)}${leak(354, 444, 14, 32)}`);
  return s;
}

function boilerRoom() {
  let s = '';
  s += `<g class="decor">
    <rect x="490" y="440" width="96" height="60" rx="6" fill="#3b424a" stroke="#262a2f" stroke-width="3"/>${txt(538, 476, 'FW PUMP', 'decor-label', 'text-anchor="middle"')}
    <circle cx="640" cy="520" r="26" fill="#2f6f8a" stroke="#1d4050" stroke-width="3"/><circle cx="702" cy="520" r="26" fill="#2f6f8a" stroke="#1d4050" stroke-width="3"/>
    ${txt(671, 566, 'SOFTENERS', 'decor-label', 'text-anchor="middle"')}
    <circle cx="820" cy="470" r="18" fill="#c9a227" stroke="#7a6212" stroke-width="3"/><circle cx="860" cy="470" r="18" fill="#c9a227" stroke="#7a6212" stroke-width="3"/>
    <rect x="780" y="520" width="100" height="44" fill="url(#hatch)" opacity=".7"/></g>`;
  // steam main: insulated riser + header
  s += `<path d="M616 182 V336" stroke="#cfd5db" stroke-width="18"/><path d="M476 336 H884" stroke="#cfd5db" stroke-width="18"/>`;
  s += `<g stroke="#9aa3ad" stroke-width="2">${[500, 520, 540, 820, 840, 860].map((x) => `<path d="M${x} 327 V345"/>`).join('')}</g>`;

  s += hot('boiler', 'finding', `
    <rect x="496" y="76" width="240" height="106" rx="53" fill="url(#boilerG)" stroke="#3a0b0b" stroke-width="3"/>
    <g stroke="#5c1111" stroke-width="3">${[560, 600, 640, 680].map((x) => `<path d="M${x} 80 V178"/>`).join('')}</g>
    <circle cx="526" cy="129" r="22" fill="#2a1a12" stroke="#1a0d08" stroke-width="3"/>
    <circle cx="526" cy="129" r="13" fill="#ff8a1f"><animate attributeName="r" values="11;15;12;14;11" dur="0.7s" repeatCount="indefinite"/><animate attributeName="fill" values="#ff8a1f;#ffc23d;#ff6a1a;#ff8a1f" dur="0.9s" repeatCount="indefinite"/></circle>
    <circle cx="526" cy="129" r="6" fill="#fff1a8"/>
    ${txt(572, 124, 'BOILER', 'eq-label')}${txt(572, 144, '5 MMBtu/hr', 'eq-label small')}
    <circle cx="712" cy="129" r="17" fill="#2a2d31" stroke="#15171a" stroke-width="4"/>`,
    wisps(700, 724, 122, 5, '#8f98a2', 64));

  s += hot('condensate', 'decoy', `
    <circle cx="802" cy="136" r="44" fill="url(#jacketG)" stroke="#6f7881" stroke-width="3"/>
    <g stroke="#8d96a0" stroke-width="2" fill="none"><circle cx="802" cy="136" r="33"/><circle cx="802" cy="136" r="22"/></g>
    ${txt(802, 133, 'COND.', 'eq-label dark', 'text-anchor="middle"')}${txt(802, 149, 'RETURN', 'eq-label dark small', 'text-anchor="middle"')}`);

  s += hot('insulation', 'finding', `
    <ellipse cx="680" cy="336" rx="140" ry="26" fill="url(#heat)"><animate attributeName="opacity" values=".6;1;.6" dur="1.8s" repeatCount="indefinite"/></ellipse>
    <path d="M560 336 H800" stroke="#8a4a2a" stroke-width="13"/>
    <path d="M560 332 H800" stroke="#c0703f" stroke-width="3"/>
    <g fill="#5d3019">${[600, 650, 700, 750].map((x) => `<rect x="${x}" y="328" width="6" height="16"/>`).join('')}</g>
    ${txt(566, 368, 'STEAM 150 PSIG · 4"', 'eq-label')}`,
    wisps(566, 796, 326, 9, '#f2f5f7', 42));
  return s;
}

function productionFloor() {
  let s = '';
  s += `<g class="decor">${[40, 170, 300].map((x, i) => `
    <rect x="${x}" y="812" width="100" height="84" rx="6" fill="#39414a" stroke="#22272c" stroke-width="3"/>
    <rect x="${x + 10}" y="822" width="44" height="26" rx="3" fill="#0f1a24"/><rect x="${x + 14}" y="826" width="36" height="4" fill="#3d8bd9"/>
    <circle cx="${x + 78}" cy="835" r="6" fill="${i === 1 ? '#f5c518' : '#35c46a'}"/>
    ${txt(x + 50, 884, 'CNC-' + (i + 1), 'decor-label', 'text-anchor="middle"')}`).join('')}
    <rect x="290" y="960" width="120" height="50" fill="url(#hatch)" opacity=".6"/></g>`;

  let fixtures = '';
  let k = 0;
  for (const y of [690, 738]) {
    for (const x of [40, 136, 232, 328]) {
      fixtures += `<g>${k % 3 === 1 ? flicker(k) : ''}
        <ellipse cx="${x + 40}" cy="${y + 15}" rx="56" ry="28" fill="url(#t12glow)"/>
        <rect x="${x}" y="${y}" width="80" height="30" rx="3" fill="#b9c1c8" stroke="#5a636c" stroke-width="2"/>
        ${[6, 12, 18, 24].map((dy) => `<path d="M${x + 6} ${y + dy} H${x + 74}" stroke="#eef6d8" stroke-width="3.2" stroke-linecap="round"/>`).join('')}
      </g>`;
      k++;
    }
  }
  s += hot('lighting', 'finding', `${fixtures}${txt(40, 784, '4-LAMP T12 FIXTURES (×120)', 'eq-label small')}`);

  s += hot('vfd', 'finding', `
    <circle cx="112" cy="1010" r="60" fill="#16191c" stroke="#65707c" stroke-width="5"/>
    ${blades(112, 1010, 52, 6, 0.35, '#9aa5b1')}
    <g fill="none" stroke="#8e98a3" stroke-width="1.5"><circle cx="112" cy="1010" r="56"/><circle cx="112" cy="1010" r="40"/><circle cx="112" cy="1010" r="24"/></g>
    <path d="M172 1010 H192" stroke="#65707c" stroke-width="16"/>
    <rect x="192" y="966" width="64" height="88" rx="4" fill="#3b424a" stroke="#22272c" stroke-width="3"/>
    <g stroke="#c7cfd6" stroke-width="5" stroke-linecap="round">${[980, 996, 1012, 1028, 1044].map((y) => `<path d="M202 ${y + 6} L246 ${y - 4}"/>`).join('')}</g>
    ${txt(52, 1072, 'EXHAUST FAN 50 HP', 'eq-label small')}${txt(224, 962, 'DAMPER', 'eq-label small', 'text-anchor="middle"')}`);

  s += hot('motor', 'decoy', `
    <rect x="36" y="1142" width="266" height="40" rx="6" fill="url(#belt)" stroke="#15171a" stroke-width="3"/>
    <g><rect x="40" y="1148" width="34" height="28" rx="3" fill="#b8874f" stroke="#6d4f2c" stroke-width="2"/>
      <animateTransform attributeName="transform" type="translate" from="0 0" to="226 0" dur="5s" repeatCount="indefinite"/></g>
    <g><rect x="40" y="1148" width="34" height="28" rx="3" fill="#b8874f" stroke="#6d4f2c" stroke-width="2"/>
      <animateTransform attributeName="transform" type="translate" from="0 0" to="226 0" dur="5s" begin="-2.5s" repeatCount="indefinite"/></g>
    <rect x="308" y="1130" width="64" height="64" rx="8" fill="#2f6b52" stroke="#17392b" stroke-width="3"/>
    <g stroke="#1f4a38" stroke-width="3">${[1140, 1150, 1160, 1170, 1180].map((y) => `<path d="M314 ${y} H366"/>`).join('')}</g>
    <circle cx="340" cy="1162" r="10" fill="#c7cfd6"/><path d="M340 1154 V1170" stroke="#2a2f35" stroke-width="3">${spin(340, 1162, 0.4)}</path>
    ${txt(316, 1208, '15 HP', 'eq-label small')}`);
  return s;
}

function warehouse() {
  let s = '';
  s += `<g class="decor"><g transform="translate(540 1040)"><rect width="46" height="64" rx="6" fill="#e0b21b" stroke="#6b5608" stroke-width="3"/>
      <rect x="8" y="10" width="30" height="24" rx="3" fill="#1d1f22"/><rect x="8" y="-26" width="6" height="28" fill="#9aa5b1"/><rect x="32" y="-26" width="6" height="28" fill="#9aa5b1"/></g>
      ${txt(563, 1122, 'FORKLIFT', 'decor-label', 'text-anchor="middle"')}
      <rect x="660" y="1020" width="60" height="60" fill="#8a6a42" stroke="#4e3b22" stroke-width="3"/><rect x="730" y="1020" width="60" height="60" fill="#8a6a42" stroke="#4e3b22" stroke-width="3"/></g>`;

  let racks = '';
  for (const x of [496, 596, 696]) {
    racks += `<rect x="${x}" y="690" width="38" height="276" fill="#343a41" stroke="#20252a" stroke-width="2"/>`;
    for (let y = 700; y < 960; y += 34) racks += `<rect x="${x + 4}" y="${y}" width="30" height="26" fill="#8a6a42" opacity=".85"/><path d="M${x} ${y + 30} H${x + 38}" stroke="#d9822b" stroke-width="3"/>`;
  }
  let lights = '';
  for (const x of [566, 666, 758]) {
    for (const y of [718, 800, 882, 950]) {
      lights += `<circle cx="${x}" cy="${y}" r="34" fill="url(#glow)"><animate attributeName="opacity" values=".75;1;.75" dur="${(2.4 + ((x + y) % 5) * 0.3).toFixed(1)}s" repeatCount="indefinite"/></circle>
        <circle cx="${x}" cy="${y}" r="11" fill="#fdfbe6" stroke="#9aa5b1" stroke-width="3"/>`;
    }
  }
  s += hot('occupancy', 'finding', `${racks}${lights}`);
  s += txt(630, 990, 'AISLES 1–3 · LED HIGH-BAY', 'eq-label small', 'text-anchor="middle"');

  // office
  s += `<g class="decor"><rect x="778" y="676" width="108" height="222" fill="#2d3238" stroke="#5d6670" stroke-width="4"/>
    <rect x="790" y="846" width="56" height="30" rx="3" fill="#6b4e32"/><circle cx="818" cy="886" r="8" fill="#1d1f22"/>
    <rect x="800" y="850" width="22" height="14" fill="#0f1a24"/>${txt(826, 704, 'OFFICE', 'eq-label', 'text-anchor="middle"')}</g>`;
  s += hot('thermostat', 'decoy', `
    <rect x="791" y="771" width="48" height="44" rx="10" fill="#e9edf0" stroke="#5d6670" stroke-width="2"/>
    <circle cx="815" cy="793" r="15" fill="#0f1a24"/>
    <text x="815" y="797" class="thermo" text-anchor="middle">68°</text>`);

  s += hot('dock', 'decoy', `
    <rect x="604" y="1156" width="152" height="26" fill="url(#hatch)" opacity=".85"/>
    <rect x="604" y="1190" width="152" height="30" rx="2" fill="#5b6571" stroke="#22272c" stroke-width="3"/>
    <g stroke="#3f4750" stroke-width="2">${[1196, 1202, 1208, 1214].map((y) => `<path d="M608 ${y} H752"/>`).join('')}</g>
    <rect x="594" y="1186" width="12" height="38" rx="3" fill="#111"/><rect x="754" y="1186" width="12" height="38" rx="3" fill="#111"/>
    ${txt(680, 1150, 'DOCK 1', 'eq-label', 'text-anchor="middle"')}`);
  return s;
}

export function buildPlantSVG() {
  seed = 7;
  const zoneHL = Object.entries(ZONE_RECTS)
    .map(([id, z]) => `<rect class="zone-hl" data-zone="${id}" x="${z.x + 6}" y="${z.y + 6}" width="${z.w - 12}" height="${z.h - 12}" rx="8"/>`)
    .join('');
  return `<svg id="plant" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WORLD.w} ${WORLD.h}" width="${WORLD.w}" height="${WORLD.h}" role="img" aria-label="Top-down plant floor">
    ${defs()}${zonesBase()}${compressorRoom()}${boilerRoom()}${productionFloor()}${warehouse()}${zoneHL}
  </svg>`;
}
