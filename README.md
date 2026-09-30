# Plant Walk: U-CREW Energy Assessment Challenge

A mobile-first browser game from the University of Utah U-CREW. You're an energy assessor with **5 minutes** to walk a manufacturing plant and find energy waste. Each find becomes an **Assessment Recommendation (AR)** card with real engineering math. Your score is the total annual dollar savings you identify.

**Play:** https://jackurness13.github.io/plant-walk-test/

## Run locally
It's a static site with no build step. Serve the folder with any static server (ES modules don't load from `file://`):

```bash
npx serve .
```

## Editing the engineering
All numbers live in **`js/ars.js`**:
- `GLOBALS` holds operating hours, utility rates, CO₂ factors, the game length, and the penalties.
- `ARS` holds the 8 findings. Each one has its inputs (`params`), implementation cost, the measurement shown on its gauge, and a `calc()` that returns kW, kWh, MMBtu, and the plugged-in formula lines.
- `DECOYS` holds the 5 pieces of equipment that are already efficient.

The AR cards, the "Show math" panels, the end-screen totals, and the printed report are all generated from this file. After editing, run `npm run test:calc`.

## Tests (quality gate)
```bash
npm install
npx playwright install chromium
npm test
```
- `tests/calc.test.mjs` recomputes every AR by hand and compares it with `js/ars.js`.
- `tests/e2e.mjs` runs Playwright at 390×844 (touch) and 1280×800. It screenshots every screen into `./screenshots` and plays a full game: it hits a decoy, uses a hint, finds all 8, sorts the table, saves to the leaderboard, prints, and replays. It also runs a fake-clock game until time expires. The test fails on any console error, page error, failed request, horizontal overflow, clipped element, or tap target under 44 px.

## Results with default inputs
| ARC | Recommendation | Savings | $/yr | Cost | Payback |
|---|---|---|---|---|---|
| 2.4236 | Eliminate compressed air leaks | 163,800 kWh · 27.3 kW | $17,035 | $2,000 | 0.12 yr |
| 2.4231 | Reduce air pressure 125→100 psig | 50,061 kWh · 8.3 kW | $5,206 | $500 | 0.10 yr |
| 2.4221 | Outside air for compressor intake | 32,039 kWh · 5.3 kW | $3,332 | $4,000 | 1.20 yr |
| 2.4146 | VFD on 50 hp exhaust fan | 110,712 kWh · 18.5 kW | $11,514 | $15,000 | 1.30 yr |
| 2.7142 | T12 → LED retrofit | 73,440 kWh · 12.2 kW | $7,638 | $18,000 | 2.36 yr |
| 2.7135 | Occupancy sensors | 18,396 kWh · 0 kW | $1,472 | $2,400 | 1.63 yr |
| 2.1233 | Boiler O₂ trim / tune-up | 375 MMBtu | $3,000 | $6,500 | 2.17 yr |
| 2.2511 | Insulate bare steam pipe | 135 MMBtu | $1,080 | $700 | 0.65 yr |
| | **Total** | 448,448 kWh · 510 MMBtu · 186.8 tons CO₂e | **$50,277** | $49,100 | 1.0 yr |

## Assumptions
The brief didn't specify these, so I made reasonable choices. All of them can be edited in `js/ars.js`.

**Engineering**
- **Demand savings:** $12/kW-month × 12 months, applied to the full kW reduction (coincidence factor 1). The exception is occupancy sensors, which get **0 kW** because the lights are still on during the monthly peak.
- **Compressor power** (used by ARs 2 and 3): 100 hp × 0.746 × 0.85 load factor ÷ 0.95 motor efficiency = 66.7 kW.
- **Exhaust fan full-flow power:** 50 hp × 0.746 × 0.90 load ÷ 0.93 motor efficiency = 36.1 kW. With the damper throttled to 70% flow, the fan draws **88%** of full power (a typical outlet-damper curve). With a VFD it draws 0.7³ ÷ 0.93.
- **Outside-air intake:** the 55 °F figure is treated as the average outdoor temperature during operating hours.
- **Operating hours:** steam-pipe losses and the boiler use the plant's 6,000 hr/yr. Warehouse lighting uses 8,760 hr/yr, as the brief specified.
- **Interactive effects are ignored.** For example, the leak repair and pressure reduction are each computed against the original baseline. The printed report notes this.
- **Implementation costs** are screening-level estimates: leaks $2,000; pressure reset $500; intake duct $4,000; VFD $15,000; LED retrofit 120 × $150; sensors 12 × $200; O₂ trim + tune-up $6,500; insulation 20 ft × $35.
- **CO₂e:** 0.7 lb/kWh and 117 lb/MMBtu, reported in short tons (÷ 2,000).

**Gameplay**
- The timer **keeps running** while an AR card is open. A find counts as soon as you tap it. The card can't be dismissed until you take the reading, and then the $/yr is added to the ticker.
- Tapping a decoy costs 10 s once. Tapping it again only re-shows the explanation.
- A hint picks a random zone that still has an unfound item, flashes it, and scrolls to it. It's disabled when 20 s or less remain.
- The game ends when the timer hits 0, when all 8 are found, or when you tap "End Walk."
- **Grade:** Lead Assessor = all 8 found. Otherwise it's based on the share of the maximum $/yr: Senior ≥ 70%, Assessor ≥ 40%, Junior ≥ 15%, and Rookie below that.
- **Leaderboard:** top 10 by $/yr, stored in `localStorage` per device. That means each phone keeps its own board. There's no shared board because the brief ruled out a backend.
- **Panning:** phones use native touch scrolling. On desktop you can click and drag. Zone buttons at the bottom jump to each room.
- Sounds are synthesized with the Web Audio API and start on the first tap, as iOS requires. The mute setting is remembered.
