// Unit test: re-derives every AR by hand and checks js/ars.js against it.
// Run: node tests/calc.test.mjs
import { ARS, DECOYS, GLOBALS as G, evaluate, totals } from '../js/ars.js';

let failures = 0;
const close = (label, got, want, tol = 0.001) => {
  const ok = Math.abs(got - want) <= Math.max(Math.abs(want) * tol, 1e-9);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(44)} got ${got.toFixed(4)}  want ${want.toFixed(4)}`);
};

const H = 6000, E = 0.08, D = 12, NG = 8;
const $e = (kWh, kW) => kWh * E + kW * D * 12;

// Independent hand calculations, straight from the brief
const compKW = (100 * 0.746 * 0.85) / 0.95;
const fanFull = (50 * 0.746 * 0.9) / 0.93;
const expected = {
  leaks: (() => { const kW = (6.5 + 26 + 104) * 0.2; return { kW, kWh: kW * H, mmbtu: 0, cost: 2000 }; })(),
  pressure: (() => { const kW = compKW * 0.125; return { kW, kWh: kW * H, mmbtu: 0, cost: 500 }; })(),
  intake: (() => { const kW = compKW * 0.08; return { kW, kWh: kW * H, mmbtu: 0, cost: 4000 }; })(),
  vfd: (() => { const kW = fanFull * 0.88 - (fanFull * 0.343) / 0.93; return { kW, kWh: kW * H, mmbtu: 0, cost: 15000 }; })(),
  lighting: { kW: 12.24, kWh: 12.24 * H, mmbtu: 0, cost: 18000 },
  occupancy: { kW: 0, kWh: 6 * 8760 * 0.35, mmbtu: 0, cost: 2400 },
  boiler: { kW: 0, kWh: 0, mmbtu: 5 * 0.5 * H * 0.025, cost: 6500 },
  insulation: { kW: 0, kWh: 0, mmbtu: (20 * 1000 * 0.9 * H) / 0.8 / 1e6, cost: 700 },
};

// Spot values quoted in the brief / README
close('leaks kW (136.5 CFM × 0.2)', expected.leaks.kW, 27.3);
close('lighting kWh', expected.lighting.kWh, 73440);
close('occupancy kWh', expected.occupancy.kWh, 18396);
close('boiler MMBtu', expected.boiler.mmbtu, 375);
close('insulation MMBtu', expected.insulation.mmbtu, 135);

if (ARS.length !== 8) { failures++; console.log('FAIL  expected 8 ARs, found', ARS.length); }
if (DECOYS.length !== 5) { failures++; console.log('FAIL  expected 5 decoys, found', DECOYS.length); }

let sumSavings = 0;
for (const ar of ARS) {
  const want = expected[ar.id];
  if (!want) { failures++; console.log('FAIL  no expected values for', ar.id); continue; }
  const r = evaluate(ar);
  const wantSavings = $e(want.kWh, want.kW) + want.mmbtu * NG;
  sumSavings += wantSavings;
  close(`${ar.arc} ${ar.id} kW`, r.kW, want.kW);
  close(`${ar.arc} ${ar.id} kWh/yr`, r.kWh, want.kWh);
  close(`${ar.arc} ${ar.id} MMBtu/yr`, r.mmbtu, want.mmbtu);
  close(`${ar.arc} ${ar.id} $/yr`, r.savings, wantSavings);
  close(`${ar.arc} ${ar.id} payback yr`, r.payback, want.cost / wantSavings);
  close(`${ar.arc} ${ar.id} CO2e lb`, r.co2lb, want.kWh * 0.7 + want.mmbtu * 117);
  if (!r.lines.length || r.lines.some((l) => /NaN|undefined|Infinity/.test(l))) {
    failures++; console.log('FAIL  bad math lines for', ar.id, r.lines);
  }
  if (!Number.isFinite(r.payback) || r.payback <= 0) { failures++; console.log('FAIL  payback', ar.id); }
}
close('TOTAL $/yr', totals(ARS).savings, sumSavings);
if (G.hours !== H || G.elecRate !== E || G.demandRate !== D || G.gasRate !== NG) {
  failures++; console.log('FAIL  GLOBALS differ from brief defaults');
}

console.log(`\nTotal identifiable savings: $${Math.round(totals(ARS).savings).toLocaleString()}/yr`);
console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll AR calculations verified.');
process.exit(failures ? 1 : 0);
