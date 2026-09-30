// Quality gate: screenshots every screen at phone + desktop sizes, plays a full game,
// and fails on ANY console error / page error / failed request / layout overflow.
// Run: node tests/e2e.mjs   (screenshots → ./screenshots)
import { chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/`;

const FINDINGS = ['leaks', 'pressure', 'intake', 'vfd', 'lighting', 'occupancy', 'boiler', 'insulation'];
const problems = [];
const fail = (m) => { problems.push(m); console.log('  ✗', m); };
const step = (m) => console.log('  •', m);

async function checkLayout(page, where) {
  const r = await page.evaluate(() => {
    const vw = innerWidth;
    const bad = [];
    const docOverflow = document.documentElement.scrollWidth > vw + 1;
    // visible elements (outside the pannable map) that spill past the viewport
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('#map, #print-report, svg, canvas, .table-wrap')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || !el.getClientRects().length) continue;
      const b = el.getBoundingClientRect();
      if (b.width && (b.right > vw + 1 || b.left < -1)) bad.push(`${el.tagName}.${el.className || el.id} [${Math.round(b.left)},${Math.round(b.right)}]`);
      // clipped text: content wider than box for single-line text holders
      if (['B', 'SPAN', 'BUTTON'].includes(el.tagName) && cs.overflow !== 'visible' && el.scrollWidth > el.clientWidth + 1) bad.push(`clipped ${el.tagName}.${el.className}`);
    }
    // tap targets
    const small = [...document.querySelectorAll('button, .btn, input')].filter((el) => {
      if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden' || el.closest('#print-report')) return false;
      const b = el.getBoundingClientRect();
      return b.width > 0 && (b.height < 43.5 || b.width < 43.5);
    }).map((el) => `${el.tagName}#${el.id}.${el.className} ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`);
    return { docOverflow, bad: bad.slice(0, 8), small: small.slice(0, 8) };
  });
  if (r.docOverflow) fail(`${where}: horizontal page overflow`);
  if (r.bad.length) fail(`${where}: elements outside viewport/clipped: ${r.bad.join('; ')}`);
  if (r.small.length) fail(`${where}: tap targets < 44px: ${r.small.join('; ')}`);
}

async function run(browser, name, viewport, opts = {}) {
  console.log(`\n=== ${name} ${viewport.width}×${viewport.height} ===`);
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: opts.dpr || 1, hasTouch: !!opts.touch, isMobile: !!opts.touch });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') fail(`[${name}] console error: ${m.text()}`); });
  page.on('pageerror', (e) => fail(`[${name}] page error: ${e.message}`));
  page.on('requestfailed', (r) => fail(`[${name}] request failed: ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400) fail(`[${name}] HTTP ${r.status()} ${r.url()}`); });
  const shot = async (n, full = false) => page.screenshot({ path: path.join(OUT, `${name}-${n}.png`), fullPage: full });
  const tap = async (sel) => (opts.touch ? page.tap(sel) : page.click(sel));

  await page.goto(URL_);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#btn-start');
  await shot('01-title', true);
  await checkLayout(page, `${name} title`);

  await tap('#btn-leaderboard');
  await page.waitForSelector('#modal:not([hidden])');
  await page.waitForTimeout(300);
  await shot('02-leaderboard-empty');
  await tap('#modal [data-close]');

  step('start game');
  await tap('#btn-start');
  await page.waitForSelector('#screen-game.active');
  await page.waitForTimeout(500);
  await shot('03-game');
  await checkLayout(page, `${name} game`);
  if ((await page.textContent('#timer')).trim() !== '5:00' && (await page.textContent('#timer')).trim() !== '4:59') fail('timer did not start at 5:00');

  for (const z of ['boiler', 'production', 'warehouse', 'compressor']) {
    await tap(`.zone-nav button[data-zone="${z}"]`);
    await page.waitForTimeout(900);
    await shot(`03-zone-${z}`);
  }

  step('hit a decoy');
  const before = await page.evaluate(() => document.querySelector('#timer').textContent);
  await tap('.hot[data-id="drain"]');
  await page.waitForSelector('#btn-close-decoy');
  await page.waitForTimeout(350);
  await shot('04-decoy');
  const after = await page.evaluate(() => document.querySelector('#timer').textContent);
  const secs = (s) => { const [m, x] = s.split(':').map(Number); return m * 60 + x; };
  if (secs(before) - secs(after) < 9) fail(`decoy penalty not applied (${before} → ${after})`);
  await checkLayout(page, `${name} decoy modal`);
  await tap('#btn-close-decoy');

  step('hint');
  await tap('#btn-hint');
  await page.waitForTimeout(700);
  await shot('05-hint');

  for (const [i, id] of FINDINGS.entries()) {
    step(`find ${id}`);
    await tap(`.hot[data-id="${id}"]`);
    await page.waitForSelector('#btn-read');
    await page.waitForTimeout(260);
    if (i === 0) { await shot('06-ar-before-reading'); await checkLayout(page, `${name} AR card`); }
    await tap('#btn-read');
    await page.waitForSelector('.ar-results:not([hidden])');
    await page.waitForTimeout(1100);
    if (i === 0 || id === 'vfd') {
      await page.click('.math summary');
      await page.waitForTimeout(200);
      await shot(`07-ar-${id}-result`);
      await page.evaluate(() => { const s = document.querySelector('.sheet'); s.scrollTop = s.scrollHeight; });
      await page.waitForTimeout(150);
      await shot(`08-ar-${id}-math`);
      await checkLayout(page, `${name} AR result`);
    }
    const n = await page.textContent('#finds');
    if (n.trim() !== `${i + 1}/8`) fail(`finds counter shows ${n} after ${i + 1} finds`);
    await tap('#btn-close-card');
    await page.waitForSelector('#modal', { state: 'hidden' });
  }

  step('end screen');
  await page.waitForSelector('#screen-end.active', { timeout: 5000 });
  await page.waitForTimeout(1500);
  const total = await page.textContent('#end-total');
  const grade = await page.textContent('#grade');
  step(`total ${total}, grade ${grade}`);
  if (total.trim() !== '$50,277') fail(`end total ${total} ≠ $50,277`);
  if (grade.trim() !== 'Lead Assessor') fail(`grade ${grade} ≠ Lead Assessor`);
  await shot('09-end', true);
  await checkLayout(page, `${name} end`);

  // sort table by payback asc
  await tap('#ar-table th button[data-sort="payback"]');
  const firstArc = await page.textContent('#ar-table tbody tr:first-child .arc-chip');
  if (firstArc.trim() !== '2.4231') fail(`sorting by payback gave ${firstArc} first (expected 2.4231)`);
  await tap('#ar-table th button[data-sort="savings"]');

  await page.fill('#initials', 'uut');
  await tap('#lb-form button[type="submit"]');
  await page.waitForSelector('.saved');
  const ini = await page.textContent('.board li.me .ini');
  if (ini.trim() !== 'UUT') fail(`leaderboard entry shows ${ini}`);
  await shot('10-end-saved', true);

  await page.emulateMedia({ media: 'print' });
  await shot('11-print', true);
  const prText = await page.textContent('#print-report');
  if (!prText.includes('2.4236') || !prText.includes('UUT')) fail('print report missing AR or initials');
  await page.emulateMedia({ media: 'screen' });

  step('play again → hint path, then time-out path via manual end');
  await tap('#btn-again');
  await page.waitForSelector('#screen-game.active');
  if ((await page.textContent('#finds')).trim() !== '0/8') fail('state not reset on Play Again');
  await tap('.hot[data-id="boiler"]');
  await tap('#btn-read');
  await page.waitForSelector('.ar-results:not([hidden])');
  await tap('#btn-close-card');
  await tap('#btn-finish');
  await page.waitForSelector('#btn-confirm-end');
  await shot('12-confirm-end');
  await tap('#btn-confirm-end');
  await page.waitForSelector('#screen-end.active');
  await tap('#btn-reveal');
  await page.waitForTimeout(1300);
  await shot('13-end-missed', true);
  await checkLayout(page, `${name} end (missed)`);
  await tap('#missed-list [data-ar="leaks"]');
  await page.waitForSelector('.ar-results:not([hidden])');
  await page.waitForTimeout(300);
  await shot('14-missed-card');
  await tap('#btn-close-card');

  await tap('#btn-home');
  await tap('#btn-leaderboard');
  await page.waitForTimeout(300);
  await shot('15-leaderboard');
  await ctx.close();
}

async function runTimeout(browser) {
  console.log('\n=== timer expiry (fake clock) ===');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') fail(`[timeout] console error: ${m.text()}`); });
  page.on('pageerror', (e) => fail(`[timeout] page error: ${e.message}`));
  await page.clock.install();
  await page.goto(URL_);
  await page.click('#btn-start');
  await page.click('.hot[data-id="leaks"]');
  await page.click('#btn-read');
  await page.clock.runFor(3000);
  await page.click('#btn-close-card');
  await page.clock.runFor(285_000);
  const t = await page.textContent('#timer');
  step(`timer after 4:48 → ${t}`);
  if (!/^0:1[0-3]$/.test(t.trim())) fail(`timer shows ${t} after 288 s`);
  await page.clock.runFor(15_000);
  await page.waitForSelector('#screen-end.active');
  const reason = await page.textContent('.end-reason');
  if (!reason.includes("Time's up")) fail(`expected time-up end, got ${reason}`);
  if ((await page.textContent('#end-total')).trim() !== '$17,035') fail('time-out total should be leaks only ($17,035)');
  step(`ended: ${reason}`);
  await ctx.close();
}

const browser = await chromium.launch();
try {
  await run(browser, 'phone', { width: 390, height: 844 }, { touch: true, dpr: 2 });
  await run(browser, 'desktop', { width: 1280, height: 800 });
  await runTimeout(browser);
} catch (e) {
  fail('exception: ' + (e.stack || e.message));
} finally {
  await browser.close();
  server.close();
}
console.log(problems.length ? `\n${problems.length} PROBLEM(S) — quality gate FAILED` : '\nQuality gate PASSED — screenshots in ./screenshots');
process.exit(problems.length ? 1 : 0);
