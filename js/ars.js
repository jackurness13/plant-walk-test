// =====================================================================
//  Plant Walk — Assessment Recommendation (AR) configuration
//  ---------------------------------------------------------------------
//  EVERYTHING numeric about the game's engineering lives in this file.
//  Edit GLOBALS or any entry in ARS / DECOYS and the game, the AR cards,
//  the "Show math" panels, the end-screen totals and the printed report
//  all update automatically. `node tests/calc.test.mjs` re-checks the math.
//
//  Each AR:
//    id, arc, title, zone         identity + where it sits on the map
//    equipment, observed          what the assessor sees
//    measure                      the "take a reading" gauge (value is what the meter shows)
//    params                       every input assumption for the calculation
//    implCost, costBasis          estimated implementation cost ($) and how it was estimated
//    recommendation               one-line action
//    calc(p, G)                   returns { kW, kWh, mmbtu, lines[] }
//                                   kW    = demand reduction (kW) credited on the utility bill
//                                   kWh   = electricity saved per year
//                                   mmbtu = natural gas saved per year
//                                   lines = the formula with numbers plugged in (shown in "Show math")
//  evaluate(ar) adds the $ conversion, payback, and CO2e using GLOBALS.
// =====================================================================

export const GLOBALS = {
  hours: 6000,            // plant operating hours per year
  elecRate: 0.08,         // $/kWh
  demandRate: 12,         // $/kW-month
  gasRate: 8,             // $/MMBtu natural gas
  co2PerKWh: 0.7,         // lb CO2e per kWh
  co2PerMMBtu: 117,       // lb CO2e per MMBtu natural gas
  gameSeconds: 300,       // 5:00 walk
  decoyPenalty: 10,       // seconds lost for tapping efficient equipment
  hintPenalty: 20,        // seconds a hint costs
};

export const ZONES = [
  { id: 'compressor', name: 'Compressor Room' },
  { id: 'boiler', name: 'Boiler Room' },
  { id: 'production', name: 'Production Floor' },
  { id: 'warehouse', name: 'Warehouse / Office' },
];

// ---------- number formatting shared by the UI and the math panels ----------
export const fmt = (x, d = 0) =>
  Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const money = (x) => '$' + fmt(Math.round(x));

// Motor electrical input power: hp × 0.746 kW/hp × load factor ÷ motor efficiency
const motorKW = (hp, lf, eff) => (hp * 0.746 * lf) / eff;

// =====================================================================
//  The 8 real findings
// =====================================================================
export const ARS = [
  {
    id: 'leaks',
    arc: '2.4236',
    title: 'Eliminate Compressed Air Leaks',
    zone: 'compressor',
    equipment: 'Compressed air distribution header',
    observed:
      'Audible hissing along the 100 psig main header. An ultrasonic survey tags three leaks: 1/16", 1/8" and 1/4" equivalent orifices. Leaks run 24/7 whenever the compressor is loaded.',
    measure: { tool: 'Ultrasonic leak detector', label: 'Total leak flow', unit: 'CFM', value: 136.5, min: 0, max: 200, decimals: 1 },
    params: {
      leaks: [
        { size: '1/16"', cfm: 6.5 },
        { size: '1/8"', cfm: 26 },
        { size: '1/4"', cfm: 104 },
      ],
      pressure: 100,       // psig (flows above are at this pressure)
      kWperCFM: 0.2,       // compressor specific power
    },
    implCost: 2000,
    costBasis: 'Leak tags, fittings, and ~16 hr of maintenance labor',
    recommendation: 'Repair the three tagged leaks and start a quarterly ultrasonic leak-survey program.',
    calc(p, G) {
      const cfm = p.leaks.reduce((s, l) => s + l.cfm, 0);
      const kW = cfm * p.kWperCFM;
      const kWh = kW * G.hours;
      return {
        kW, kWh, mmbtu: 0,
        lines: [
          `Leak flow @ ${p.pressure} psig = ${p.leaks.map((l) => `${fmt(l.cfm, 1)} (${l.size})`).join(' + ')} = ${fmt(cfm, 1)} CFM`,
          `Demand saved = ${fmt(cfm, 1)} CFM × ${fmt(p.kWperCFM, 2)} kW/CFM = ${fmt(kW, 1)} kW`,
          `Energy saved = ${fmt(kW, 1)} kW × ${fmt(G.hours)} hr/yr = ${fmt(kWh)} kWh/yr`,
        ],
      };
    },
  },
  {
    id: 'pressure',
    arc: '2.4231',
    title: 'Reduce Compressed Air System Pressure',
    zone: 'compressor',
    equipment: '100 hp rotary-screw air compressor',
    observed:
      'Compressor discharge set at 125 psig, yet the highest end-use requirement on the floor is 90 psig. Operators "turned it up" years ago and never turned it back.',
    measure: { tool: 'Discharge pressure gauge', label: 'Discharge pressure', unit: 'psig', value: 125, min: 0, max: 160, decimals: 0 },
    params: {
      hp: 100, loadFactor: 0.85, motorEff: 0.95,
      fromPsig: 125, toPsig: 100,
      pctPer2psi: 1,       // % compressor energy saved per 2 psi reduction
    },
    implCost: 500,
    costBasis: 'Controls technician to reset set points and verify end-use pressures',
    recommendation: 'Lower the discharge set point from 125 to 100 psig.',
    calc(p, G) {
      const kWc = motorKW(p.hp, p.loadFactor, p.motorEff);
      const dp = p.fromPsig - p.toPsig;
      const frac = ((dp / 2) * p.pctPer2psi) / 100;
      const kW = kWc * frac;
      const kWh = kW * G.hours;
      return {
        kW, kWh, mmbtu: 0,
        lines: [
          `Compressor power = ${p.hp} hp × 0.746 kW/hp × ${p.loadFactor} load ÷ ${p.motorEff} eff = ${fmt(kWc, 1)} kW`,
          `Pressure drop = ${p.fromPsig} − ${p.toPsig} = ${dp} psi → ${dp} ÷ 2 × ${p.pctPer2psi}% = ${fmt(frac * 100, 1)}% savings`,
          `Demand saved = ${fmt(kWc, 1)} kW × ${fmt(frac * 100, 1)}% = ${fmt(kW, 2)} kW`,
          `Energy saved = ${fmt(kW, 2)} kW × ${fmt(G.hours)} hr/yr = ${fmt(kWh)} kWh/yr`,
        ],
      };
    },
  },
  {
    id: 'intake',
    arc: '2.4221',
    title: 'Use Outside Air for Compressor Intake',
    zone: 'compressor',
    equipment: 'Compressor air intake filter',
    observed:
      'The compressor draws intake air from inside a hot, poorly ventilated room. Warm air is less dense, so the compressor works harder for every cubic foot delivered.',
    measure: { tool: 'Intake thermometer', label: 'Intake air temperature', unit: '°F', value: 95, min: 0, max: 130, decimals: 0 },
    params: {
      hp: 100, loadFactor: 0.85, motorEff: 0.95,
      insideF: 95, outsideF: 55,  // average annual outdoor temperature during operation
      pctPer5F: 1,                // % savings per 5 °F cooler intake
    },
    implCost: 4000,
    costBasis: 'Duct from exterior wall louver to intake filter, installed',
    recommendation: 'Duct cool outside air directly to the compressor intake.',
    calc(p, G) {
      const kWc = motorKW(p.hp, p.loadFactor, p.motorEff);
      const dT = p.insideF - p.outsideF;
      const frac = ((dT / 5) * p.pctPer5F) / 100;
      const kW = kWc * frac;
      const kWh = kW * G.hours;
      return {
        kW, kWh, mmbtu: 0,
        lines: [
          `Compressor power = ${p.hp} hp × 0.746 × ${p.loadFactor} ÷ ${p.motorEff} = ${fmt(kWc, 1)} kW`,
          `ΔT = ${p.insideF}°F − ${p.outsideF}°F = ${dT}°F → ${dT} ÷ 5 × ${p.pctPer5F}% = ${fmt(frac * 100, 1)}% savings`,
          `Demand saved = ${fmt(kWc, 1)} kW × ${fmt(frac * 100, 1)}% = ${fmt(kW, 2)} kW`,
          `Energy saved = ${fmt(kW, 2)} kW × ${fmt(G.hours)} hr/yr = ${fmt(kWh)} kWh/yr`,
        ],
      };
    },
  },
  {
    id: 'vfd',
    arc: '2.4146',
    title: 'Install VFD on Exhaust Fan',
    zone: 'production',
    equipment: '50 hp process exhaust fan with outlet damper',
    observed:
      'The exhaust fan runs at full speed while a half-closed damper throttles the airflow. Airflow trend logs average 70% of design flow.',
    measure: { tool: 'Airflow trend logger', label: 'Average airflow', unit: '% design', value: 70, min: 0, max: 100, decimals: 0 },
    params: {
      hp: 50, loadFactor: 0.9, motorEff: 0.93,
      avgFlow: 0.7,           // average fraction of design flow
      damperPowerFrac: 0.88,  // fan power fraction with outlet damper at 70% flow (typical damper curve)
      vfdEff: 0.93,
    },
    implCost: 15000,
    costBasis: '50 hp VFD, bypass, wiring, and damper lock-open — installed',
    recommendation: 'Install a variable frequency drive, lock the damper open, and control speed to demand.',
    calc(p, G) {
      const kWfull = motorKW(p.hp, p.loadFactor, p.motorEff);
      const kWdamper = kWfull * p.damperPowerFrac;
      const kWvfd = (kWfull * Math.pow(p.avgFlow, 3)) / p.vfdEff;
      const kW = kWdamper - kWvfd;
      const kWh = kW * G.hours;
      return {
        kW, kWh, mmbtu: 0,
        lines: [
          `Full-flow power = ${p.hp} hp × 0.746 × ${p.loadFactor} ÷ ${p.motorEff} = ${fmt(kWfull, 1)} kW`,
          `Damper @ ${p.avgFlow * 100}% flow = ${fmt(kWfull, 1)} kW × ${p.damperPowerFrac} = ${fmt(kWdamper, 1)} kW`,
          `VFD (affinity law, P ∝ N³) = ${fmt(kWfull, 1)} × ${p.avgFlow}³ ÷ ${p.vfdEff} = ${fmt(kWfull, 1)} × ${fmt(Math.pow(p.avgFlow, 3), 3)} ÷ ${p.vfdEff} = ${fmt(kWvfd, 1)} kW`,
          `Demand saved = ${fmt(kWdamper, 1)} − ${fmt(kWvfd, 1)} = ${fmt(kW, 1)} kW`,
          `Energy saved = ${fmt(kW, 1)} kW × ${fmt(G.hours)} hr/yr = ${fmt(kWh)} kWh/yr`,
        ],
      };
    },
  },
  {
    id: 'lighting',
    arc: '2.7142',
    title: 'Retrofit T12 Lighting to LED',
    zone: 'production',
    equipment: '120 four-lamp T12 fluorescent fixtures',
    observed:
      'The production floor is lit by 120 old 4-lamp T12 fixtures with magnetic ballasts — flickering, dim, and drawing 172 W each.',
    measure: { tool: 'Fixture power meter', label: 'Fixture input power', unit: 'W', value: 172, min: 0, max: 250, decimals: 0 },
    params: { fixtures: 120, oldW: 172, newW: 70 },
    implCost: 18000,
    costBasis: '120 LED fixtures × $150 installed',
    recommendation: 'Replace all 120 T12 fixtures with 70 W LED fixtures.',
    calc(p, G) {
      const kW = (p.fixtures * (p.oldW - p.newW)) / 1000;
      const kWh = kW * G.hours;
      return {
        kW, kWh, mmbtu: 0,
        lines: [
          `Demand saved = ${p.fixtures} fixtures × (${p.oldW} W − ${p.newW} W) ÷ 1,000 = ${fmt(kW, 2)} kW`,
          `Energy saved = ${fmt(kW, 2)} kW × ${fmt(G.hours)} hr/yr = ${fmt(kWh)} kWh/yr`,
        ],
      };
    },
  },
  {
    id: 'occupancy',
    arc: '2.7135',
    title: 'Install Occupancy Sensors',
    zone: 'warehouse',
    equipment: '40 LED high-bay fixtures over storage aisles',
    observed:
      'Warehouse high-bays burn around the clock (8,760 hr/yr). Data loggers show the aisles are empty 35% of the time.',
    measure: { tool: 'Occupancy / light logger', label: 'Hours unoccupied', unit: '%', value: 35, min: 0, max: 100, decimals: 0 },
    params: {
      fixtures: 40, watts: 150, hours: 8760, unoccupiedFrac: 0.35,
      coincidence: 0, // lights are still on during the monthly peak → no demand credit
    },
    implCost: 2400,
    costBasis: '12 high-bay occupancy sensors × $200 installed',
    recommendation: 'Put the aisle high-bays on occupancy sensors.',
    calc(p) {
      const kWconn = (p.fixtures * p.watts) / 1000;
      const kWh = kWconn * p.hours * p.unoccupiedFrac;
      const kW = kWconn * p.coincidence;
      return {
        kW, kWh, mmbtu: 0,
        lines: [
          `Connected load = ${p.fixtures} × ${p.watts} W ÷ 1,000 = ${fmt(kWconn, 1)} kW`,
          `Energy saved = ${fmt(kWconn, 1)} kW × ${fmt(p.hours)} hr/yr × ${p.unoccupiedFrac * 100}% unoccupied = ${fmt(kWh)} kWh/yr`,
          `Demand saved = 0 kW (fixtures still on at the monthly peak)`,
        ],
      };
    },
  },
  {
    id: 'boiler',
    arc: '2.1233',
    title: 'Boiler Tune-Up with O₂ Trim',
    zone: 'boiler',
    equipment: '5 MMBtu/hr natural-gas fire-tube boiler',
    observed:
      'Combustion analysis at the stack shows 45% excess air (≈6.5% O₂). A tuned burner with O₂ trim should run near 15% excess air.',
    measure: { tool: 'Combustion analyzer', label: 'Excess air', unit: '%', value: 45, min: 0, max: 100, decimals: 0 },
    params: { inputMMBtuHr: 5, loadFrac: 0.5, fromExcessAir: 45, toExcessAir: 15, fuelSavingsFrac: 0.025 },
    implCost: 6500,
    costBasis: 'O₂ trim sensor + controller, burner tune-up — installed',
    recommendation: 'Tune the burner and add O₂ trim control to hold ~15% excess air.',
    calc(p, G) {
      const fuel = p.inputMMBtuHr * p.loadFrac * G.hours;
      const mmbtu = fuel * p.fuelSavingsFrac;
      return {
        kW: 0, kWh: 0, mmbtu,
        lines: [
          `Annual fuel use = ${p.inputMMBtuHr} MMBtu/hr × ${p.loadFrac * 100}% load × ${fmt(G.hours)} hr/yr = ${fmt(fuel)} MMBtu/yr`,
          `Excess air ${p.fromExcessAir}% → ${p.toExcessAir}% ≈ ${fmt(p.fuelSavingsFrac * 100, 1)}% fuel savings`,
          `Gas saved = ${fmt(fuel)} × ${fmt(p.fuelSavingsFrac * 100, 1)}% = ${fmt(mmbtu)} MMBtu/yr`,
        ],
      };
    },
  },
  {
    id: 'insulation',
    arc: '2.2511',
    title: 'Insulate Bare Steam Piping',
    zone: 'boiler',
    equipment: '20 ft of bare 4" steam line',
    observed:
      'A 20 ft run of 4" steam pipe was never re-insulated after a repair. The bare steel is radiating heat — and it is a burn hazard.',
    measure: { tool: 'IR thermometer', label: 'Pipe surface temperature', unit: '°F', value: 350, min: 0, max: 500, decimals: 0 },
    params: { lengthFt: 20, surfaceF: 350, lossBtuHrFt: 1000, reductionFrac: 0.9, boilerEff: 0.8 },
    implCost: 700,
    costBasis: '20 ft of 2" fiberglass pipe insulation with jacket × $35/ft installed',
    recommendation: 'Insulate the bare steam line (2" fiberglass with aluminum jacket).',
    calc(p, G) {
      const lossBtuHr = p.lengthFt * p.lossBtuHrFt;
      const savedBtuYr = lossBtuHr * p.reductionFrac * G.hours;
      const mmbtu = savedBtuYr / p.boilerEff / 1e6;
      return {
        kW: 0, kWh: 0, mmbtu,
        lines: [
          `Bare-pipe heat loss @ ${p.surfaceF}°F = ${p.lengthFt} ft × ${fmt(p.lossBtuHrFt)} Btu/hr·ft = ${fmt(lossBtuHr)} Btu/hr`,
          `Heat saved = ${fmt(lossBtuHr)} × ${p.reductionFrac * 100}% × ${fmt(G.hours)} hr/yr = ${fmt(savedBtuYr / 1e6, 1)} MMBtu/yr`,
          `Fuel saved = ${fmt(savedBtuYr / 1e6, 1)} ÷ ${p.boilerEff * 100}% boiler eff = ${fmt(mmbtu, 1)} MMBtu/yr`,
        ],
      };
    },
  },
];

// =====================================================================
//  The 5 decoys — already-efficient equipment (tapping costs time)
// =====================================================================
export const DECOYS = [
  {
    id: 'drain',
    zone: 'compressor',
    title: 'Air Receiver with Zero-Loss Drain',
    why: 'This receiver already has a level-sensing zero-loss drain. It only opens when condensate is present — no compressed air is wasted like a timer drain.',
  },
  {
    id: 'condensate',
    zone: 'boiler',
    title: 'Insulated Condensate Return Tank',
    why: 'Fully jacketed and returning ~85% of condensate at 180°F. Hot condensate return is already saving feedwater heating and treatment costs.',
  },
  {
    id: 'motor',
    zone: 'production',
    title: 'NEMA Premium Conveyor Motor',
    why: 'This 15 hp conveyor motor is NEMA Premium (IE3, ~93% efficient) and was right-sized last year. A replacement would not pay back.',
  },
  {
    id: 'dock',
    zone: 'warehouse',
    title: 'Sealed Dock Door',
    why: 'The dock door has compression seals and a fast-acting insulated door. Infiltration here is already minimal.',
  },
  {
    id: 'thermostat',
    zone: 'warehouse',
    title: 'Office Smart Thermostat',
    why: 'The office RTU is on a programmable smart thermostat with night and weekend setbacks already enabled.',
  },
];

// =====================================================================
//  Economics — applies GLOBALS to one AR
// =====================================================================
export function evaluate(ar, G = GLOBALS) {
  const r = ar.calc(ar.params, G);
  const energy$ = r.kWh * G.elecRate;
  const demand$ = r.kW * G.demandRate * 12;
  const gas$ = r.mmbtu * G.gasRate;
  const savings = energy$ + demand$ + gas$;
  const payback = ar.implCost / savings;
  const co2lb = r.kWh * G.co2PerKWh + r.mmbtu * G.co2PerMMBtu;
  const lines = [...r.lines];
  if (r.kWh) lines.push(`Energy $ = ${fmt(r.kWh)} kWh × $${fmt(G.elecRate, 2)}/kWh = ${money(energy$)}/yr`);
  if (r.kW) lines.push(`Demand $ = ${fmt(r.kW, 2)} kW × $${G.demandRate}/kW-mo × 12 mo = ${money(demand$)}/yr`);
  if (r.mmbtu) lines.push(`Gas $ = ${fmt(r.mmbtu, 1)} MMBtu × $${G.gasRate}/MMBtu = ${money(gas$)}/yr`);
  const parts = [energy$, demand$, gas$].filter((x) => x > 0);
  if (parts.length > 1) lines.push(`Total savings = ${parts.map(money).join(' + ')} = ${money(savings)}/yr`);
  lines.push(`Simple payback = ${money(ar.implCost)} ÷ ${money(savings)}/yr = ${fmt(payback, 2)} yr`);
  return { kW: r.kW, kWh: r.kWh, mmbtu: r.mmbtu, energy$, demand$, gas$, savings, implCost: ar.implCost, payback, co2lb, lines };
}

export function totals(list, G = GLOBALS) {
  const t = { kW: 0, kWh: 0, mmbtu: 0, savings: 0, implCost: 0, co2lb: 0 };
  for (const ar of list) {
    const e = evaluate(ar, G);
    for (const k of Object.keys(t)) t[k] += e[k];
  }
  t.payback = t.savings ? t.implCost / t.savings : 0;
  return t;
}
