import { ARS, DECOYS, GLOBALS as G, ZONES, evaluate, totals, fmt, money } from './ars.js';
import { buildPlantSVG, ZONE_RECTS } from './plant.js';
import { sfx, unlock, isMuted, setMuted } from './audio.js';
import { initConfetti, confetti, gaugeSVG, setNeedle, countUp } from './fx.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const byId = Object.fromEntries([...ARS, ...DECOYS].map((x) => [x.id, x]));
const zoneName = (id) => ZONES.find((z) => z.id === id)?.name ?? id;
const MAX = totals(ARS);
const LB_KEY = 'plantwalk.leaderboard.v1';

const state = {
  running: false,
  endAt: 0,
  found: [],        // AR ids in the order found
  decoys: [],       // decoy ids tapped
  hints: 0,
  shown$: 0,        // value currently shown on the ticker
  lastWarn: -1,
  timerId: 0,
  startedAt: 0,
  endedAt: 0,
  savedEntry: null,
  sort: { key: 'savings', dir: -1 },
};

// ======================================================================
//  Screens, modal, toast
// ======================================================================
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  window.scrollTo(0, 0);
}

let modalOnClose = null;
function openModal(html, { onClose = null, cls = '' } = {}) {
  const m = $('#modal');
  $('#toast').classList.remove('show');
  $('#modal-body').innerHTML = html;
  $('.sheet', m).className = 'sheet ' + cls;
  m.hidden = false;
  m.scrollTop = 0;
  $('.sheet', m).scrollTop = 0;
  modalOnClose = onClose;
  requestAnimationFrame(() => m.classList.add('open'));
}
function closeModal() {
  const m = $('#modal');
  if (m.hidden) return;
  m.classList.remove('open');
  m.hidden = true;
  $('#modal-body').innerHTML = '';
  const cb = modalOnClose;
  modalOnClose = null;
  if (cb) cb();
}
$('#modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal' && !$('#modal .sheet').classList.contains('locked')) closeModal();
  if (e.target.closest('[data-close]')) { sfx.click(); closeModal(); }
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#modal').hidden && !$('#modal .sheet').classList.contains('locked')) closeModal();
});

let toastT = 0;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), ms);
}

// ======================================================================
//  Storage (leaderboard)
// ======================================================================
function loadBoard() {
  try { return JSON.parse(localStorage.getItem(LB_KEY)) || []; } catch { return []; }
}
function saveBoard(list) {
  try { localStorage.setItem(LB_KEY, JSON.stringify(list)); return true; } catch { return false; }
}
function boardHTML(list, highlight) {
  if (!list.length) return `<p class="muted center">No assessments on the board yet — be the first!</p>`;
  return `<ol class="board">${list.map((e, i) => `
    <li class="${highlight && e.id === highlight.id ? 'me' : ''}">
      <span class="rank">${i + 1}</span><span class="ini">${esc(e.initials)}</span>
      <span class="bf">${e.finds}/8</span><span class="bs">${money(e.savings)}</span>
    </li>`).join('')}</ol>`;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ======================================================================
//  Title screen
// ======================================================================
$('#btn-start').addEventListener('click', () => { unlock(); sfx.click(); startGame(); });
$('#btn-leaderboard').addEventListener('click', () => {
  unlock(); sfx.click();
  openModal(`<h2 id="modal-title" class="modal-h">🏆 Top Assessors</h2>${boardHTML(loadBoard().slice(0, 10))}
    <button class="btn btn-primary btn-block" data-close>Close</button>`);
});

// ======================================================================
//  Map
// ======================================================================
const map = $('#map');
$('#map-inner').innerHTML = buildPlantSVG();

function scrollToZone(id, smooth = true) {
  const z = ZONE_RECTS[id];
  // center wide screens; on phones align the zone's left wall so its label is readable
  const left = z.w > map.clientWidth ? z.x : z.x + z.w / 2 - map.clientWidth / 2;
  const top = z.y - 8;
  map.scrollTo({ left: Math.max(0, left), top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
}
$$('.zone-nav button').forEach((b) => b.addEventListener('click', () => { sfx.click(); scrollToZone(b.dataset.zone); }));

function updateZoneNav() {
  const cx = map.scrollLeft + map.clientWidth / 2;
  const cy = map.scrollTop + map.clientHeight / 2;
  let best = null, bd = Infinity;
  for (const [id, z] of Object.entries(ZONE_RECTS)) {
    const d = Math.hypot(z.x + z.w / 2 - cx, z.y + z.h / 2 - cy);
    if (d < bd) { bd = d; best = id; }
  }
  $$('.zone-nav button').forEach((b) => b.classList.toggle('active', b.dataset.zone === best));
}
map.addEventListener('scroll', updateZoneNav, { passive: true });

// mouse drag-to-pan (touch uses native scrolling)
let drag = null, dragMoved = false;
map.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse' || e.button !== 0) return;
  drag = { x: e.clientX, y: e.clientY, l: map.scrollLeft, t: map.scrollTop };
  dragMoved = false;
});
addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 6) { dragMoved = true; map.classList.add('dragging'); }
  if (dragMoved) { map.scrollLeft = drag.l - dx; map.scrollTop = drag.t - dy; }
});
addEventListener('pointerup', () => { drag = null; map.classList.remove('dragging'); });

map.addEventListener('click', (e) => {
  if (dragMoved) { dragMoved = false; return; }
  const h = e.target.closest('.hot');
  if (h) onHotspot(h, e);
});
map.addEventListener('keydown', (e) => {
  const h = e.target.closest?.('.hot');
  if (h && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onHotspot(h, null); }
});

function markResolved(id, kind) {
  const g = $(`.hot[data-id="${id}"]`);
  if (g) g.classList.add('resolved', kind);
}

// ======================================================================
//  Game loop
// ======================================================================
function startGame() {
  Object.assign(state, {
    running: true, found: [], decoys: [], hints: 0, shown$: 0, lastWarn: -1,
    startedAt: Date.now(), endAt: Date.now() + G.gameSeconds * 1000, savedEntry: null,
  });
  $$('.hot').forEach((g) => g.classList.remove('resolved', 'finding', 'decoy'));
  $$('.zone-hl').forEach((z) => z.classList.remove('on'));
  $('#ticker').textContent = '$0';
  updateHUD();
  show('screen-game');
  scrollToZone('compressor', false);
  updateZoneNav();
  clearInterval(state.timerId);
  state.timerId = setInterval(tick, 200);
  tick();
  toast('Walk the plant — tap anything that looks like energy waste!');
}

const timeLeft = () => Math.max(0, state.endAt - Date.now());

function tick() {
  if (!state.running) return;
  const ms = timeLeft();
  const s = Math.ceil(ms / 1000);
  const t = $('#timer');
  t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  t.parentElement.classList.toggle('low', s <= 30);
  if (s <= 10 && s > 0 && s !== state.lastWarn) { state.lastWarn = s; sfx.warn(); }
  $('#btn-hint').disabled = s <= G.hintPenalty || state.found.length === ARS.length;
  if (ms <= 0) endGame('time');
}

function updateHUD() {
  $('#finds').textContent = `${state.found.length}/${ARS.length}`;
  const target = totals(state.found.map((id) => byId[id])).savings;
  animateTicker(target);
  $('#btn-mute').innerHTML = muteIcon();
  $('#btn-mute').setAttribute('aria-label', isMuted() ? 'Unmute sound' : 'Mute sound');
}

let tickerRaf = 0;
function animateTicker(target) {
  cancelAnimationFrame(tickerRaf);
  const from = state.shown$, t0 = performance.now(), dur = 900;
  const el = $('#ticker');
  if (from === target) { el.textContent = money(target); return; }
  const f = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    state.shown$ = from + (target - from) * (1 - Math.pow(1 - k, 3));
    el.textContent = money(state.shown$);
    if (k < 1) tickerRaf = requestAnimationFrame(f);
    else { state.shown$ = target; el.textContent = money(target); }
  };
  el.parentElement.classList.remove('bump'); void el.offsetWidth; el.parentElement.classList.add('bump');
  tickerRaf = requestAnimationFrame(f);
}

function penalize(sec, label) {
  state.endAt -= sec * 1000;
  const p = $('#penalty');
  p.textContent = `−${sec}s ${label}`;
  p.classList.remove('show'); void p.offsetWidth; p.classList.add('show');
  tick();
}

const muteIcon = () => isMuted()
  ? `<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
  : `<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
$('#btn-mute').innerHTML = muteIcon();
$('#btn-mute').addEventListener('click', () => { unlock(); setMuted(!isMuted()); updateHUD(); sfx.click(); });

$('#btn-hint').addEventListener('click', () => {
  if (!state.running) return;
  const zones = [...new Set(ARS.filter((a) => !state.found.includes(a.id)).map((a) => a.zone))];
  if (!zones.length || timeLeft() <= G.hintPenalty * 1000) return;
  const z = zones[Math.floor(Math.random() * zones.length)];
  state.hints++;
  penalize(G.hintPenalty, 'hint');
  sfx.hint();
  const hl = $(`.zone-hl[data-zone="${z}"]`);
  hl.classList.remove('on'); getComputedStyle(hl).opacity; hl.classList.add('on');
  setTimeout(() => hl.classList.remove('on'), 5000);
  scrollToZone(z);
  toast(`💡 Hint: there's an unfound opportunity in the ${zoneName(z)}.`, 3500);
});

$('#btn-finish').addEventListener('click', () => {
  sfx.click();
  openModal(`<h2 id="modal-title" class="modal-h">End the walk now?</h2>
    <p class="muted">You've found ${state.found.length} of ${ARS.length} opportunities. Remaining time won't be scored.</p>
    <div class="btn-row"><button class="btn btn-ghost" data-close>Keep Walking</button>
    <button id="btn-confirm-end" class="btn btn-primary">End Walk</button></div>`);
  $('#btn-confirm-end').addEventListener('click', () => { closeModal(); endGame('manual'); });
});

// ======================================================================
//  Hotspots
// ======================================================================
function onHotspot(g, e) {
  if (!state.running) return;
  const id = g.dataset.id;
  const item = byId[id];
  if (g.dataset.kind === 'decoy') {
    const first = !state.decoys.includes(id);
    if (first) {
      state.decoys.push(id);
      markResolved(id, 'decoy');
      penalize(G.decoyPenalty, 'decoy');
      sfx.buzz();
      map.classList.remove('shake'); void map.offsetWidth; map.classList.add('shake');
      if (navigator.vibrate) try { navigator.vibrate(120); } catch { /* ignore */ }
    } else sfx.click();
    openModal(`
      <div class="decoy-tag">${first ? `Already efficient · −${G.decoyPenalty}s` : 'Already efficient'}</div>
      <h2 id="modal-title" class="modal-h">${item.title}</h2>
      <p class="decoy-zone">${zoneName(item.zone)}</p>
      <div class="ok-box"><div class="ok-icon">✓</div><p>${item.why}</p></div>
      <p class="muted small">No recommendation here — keep looking for real waste.</p>
      <button id="btn-close-decoy" class="btn btn-primary btn-block" data-close>Back to the Walk</button>`, { cls: 'decoy-sheet' });
    return;
  }
  if (state.found.includes(id)) { sfx.click(); showARCard(item, { live: false }); return; }
  state.found.push(id);
  markResolved(id, 'finding');
  sfx.click();
  showARCard(item, { live: true, tapX: e?.clientX, tapY: e?.clientY });
}

function arCardHTML(ar, { live, missed = false }) {
  const r = evaluate(ar);
  const m = ar.measure;
  const energy = [
    r.kWh ? `<div class="kv"><span>Electricity saved</span><b data-count="${r.kWh}">${fmt(r.kWh)}</b><em>kWh/yr</em></div>` : '',
    r.mmbtu ? `<div class="kv"><span>Natural gas saved</span><b data-count="${r.mmbtu}">${fmt(r.mmbtu)}</b><em>MMBtu/yr</em></div>` : '',
    `<div class="kv"><span>Demand saved</span><b data-count="${r.kW}" data-dec="1">${fmt(r.kW, 1)}</b><em>kW</em></div>`,
  ].join('');
  return `
  <article class="ar-card ${live ? 'live' : 'done'}">
    <header class="ar-head">
      <span class="arc-chip">ARC ${ar.arc}</span>
      <span class="ar-zone">${missed ? 'Missed · ' : ''}${zoneName(ar.zone)}</span>
      <h2 id="modal-title">${ar.title}</h2>
    </header>
    <section class="ar-sec">
      <h3>Observed condition</h3>
      <p class="equip">${ar.equipment}</p>
      <p>${ar.observed}</p>
    </section>
    <section class="ar-sec measure">
      <h3>Measurement <span class="tool">· ${m.tool}</span></h3>
      <button class="gauge-btn" id="btn-gauge" aria-label="Take reading">${gaugeSVG(m)}</button>
      <div class="readout"><span class="rl">${m.label}</span><span class="rv"><b id="reading">${live ? '—' : fmt(m.value, m.decimals)}</b> ${m.unit}</span></div>
      ${live ? `<button id="btn-read" class="btn btn-primary btn-block pulse">📟 Take Reading</button>` : ''}
    </section>
    <section class="ar-results" ${live ? 'hidden' : ''}>
      <div class="money-big"><span>Annual cost savings</span><b id="ar-dollars">${money(r.savings)}</b><em>per year</em></div>
      <div class="kv-grid">
        ${energy}
        <div class="kv"><span>Implementation cost</span><b>${money(r.implCost)}</b><em>${ar.costBasis}</em></div>
        <div class="kv"><span>Simple payback</span><b>${fmt(r.payback, r.payback < 1 ? 2 : 1)}</b><em>years</em></div>
      </div>
      <p class="reco"><b>Recommendation:</b> ${ar.recommendation}</p>
      <details class="math"><summary>Show math</summary><ol>${r.lines.map((l) => `<li>${l}</li>`).join('')}</ol></details>
      <button id="btn-close-card" class="btn btn-primary btn-block" data-close>${state.running ? 'Continue the Walk' : 'Close'}</button>
    </section>
  </article>`;
}

function showARCard(ar, { live, tapX, tapY, missed = false }) {
  openModal(arCardHTML(ar, { live, missed }), {
    cls: live ? 'locked' : '',
    onClose: () => { if (state.running && state.found.length === ARS.length) setTimeout(() => endGame('complete'), 250); },
  });
  const body = $('#modal-body');
  const m = ar.measure;
  setNeedle(body, m, live ? m.min : m.value, true);
  if (!live) return;
  if (tapX != null) confetti(tapX, tapY, 25);
  let done = false;
  const take = async () => {
    if (done) return;
    done = true;
    unlock();
    $('#btn-read').disabled = true;
    $('#btn-read').classList.remove('pulse');
    $('#btn-read').textContent = 'Reading…';
    sfx.measure();
    const needle = $('.needle', body);
    needle.style.transition = '';
    getComputedStyle(needle).transform;
    setNeedle(body, m, m.value);
    await countUp($('#reading'), m.value, { decimals: m.decimals, dur: 1100 });
    if (!body.isConnected || $('#modal').hidden) return;
    $('#btn-read').remove();
    const res = $('.ar-results', body);
    res.hidden = false;
    $('.sheet').classList.remove('locked');
    $$('[data-count]', res).forEach((el) => countUp(el, +el.dataset.count, { decimals: +(el.dataset.dec || 0), dur: 900 }));
    countUp($('#ar-dollars'), evaluate(ar).savings, { prefix: '$', dur: 900 });
    const rect = $('.money-big', body).getBoundingClientRect();
    confetti(rect.left + rect.width / 2, rect.top + rect.height / 2, 110);
    sfx.cash();
    updateHUD();
    res.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  $('#btn-read').addEventListener('click', take);
  $('#btn-gauge').addEventListener('click', take);
}

// ======================================================================
//  End game
// ======================================================================
function gradeFor(found, savings) {
  const frac = savings / MAX.savings;
  const ladder = ['Rookie', 'Junior Assessor', 'Assessor', 'Senior Assessor', 'Lead Assessor'];
  let i = 0;
  if (found === ARS.length) i = 4;
  else if (frac >= 0.7) i = 3;
  else if (frac >= 0.4) i = 2;
  else if (frac >= 0.15) i = 1;
  return { idx: i, name: ladder[i], ladder };
}

function endGame(reason) {
  if (!state.running) return;
  state.running = false;
  state.endedAt = Date.now();
  clearInterval(state.timerId);
  if (!$('#modal').hidden) { modalOnClose = null; closeModal(); }
  sfx.end();
  renderEnd(reason);
  show('screen-end');
  const t = totals(state.found.map((id) => byId[id]));
  if (state.found.length) setTimeout(() => confetti(innerWidth / 2, innerHeight * 0.25, 160), 150);
  renderPrint();
  return t;
}

function renderEnd(reason) {
  const list = state.found.map((id) => byId[id]);
  const t = totals(list);
  const g = gradeFor(list.length, t.savings);
  const used = Math.min(G.gameSeconds, Math.round((state.endedAt - state.startedAt) / 1000));
  const missed = ARS.filter((a) => !state.found.includes(a.id));
  const reasonText = { time: "Time's up!", complete: 'All 8 found — outstanding!', manual: 'Walk complete.' }[reason];
  $('#end-content').innerHTML = `
    <div class="end-top">
      <p class="brand">University of Utah · U-CREW</p>
      <p class="end-reason">${reasonText}</p>
      <div class="grade"><span>Your rating</span><b id="grade">${g.name}</b></div>
      <ol class="ladder">${g.ladder.map((n, i) => `<li class="${i === g.idx ? 'on' : i < g.idx ? 'past' : ''}">${n}</li>`).join('')}</ol>
      <div class="total"><span>Savings identified</span><b id="end-total">${money(t.savings)}</b><em>per year</em></div>
    </div>
    <div class="end-stats">
      <div><b>${list.length}/${ARS.length}</b><span>findings</span></div>
      <div><b>${fmt(t.kWh)}</b><span>kWh/yr</span></div>
      <div><b>${fmt(t.mmbtu)}</b><span>MMBtu/yr</span></div>
      <div><b>${fmt(t.co2lb / 2000, 1)}</b><span>tons CO₂e/yr</span></div>
      <div><b>${money(t.implCost)}</b><span>impl. cost</span></div>
      <div><b>${list.length ? fmt(t.payback, 1) : '—'}</b><span>yr payback</span></div>
    </div>
    <p class="muted small center">${Math.floor(used / 60)}:${String(used % 60).padStart(2, '0')} used · ${state.decoys.length} decoy${state.decoys.length === 1 ? '' : 's'} · ${state.hints} hint${state.hints === 1 ? '' : 's'}</p>

    <section class="card">
      <h2>Assessment Recommendations</h2>
      ${list.length ? `<div class="table-wrap"><table id="ar-table" class="ar-table">
        <thead><tr>
          <th><button data-sort="arc">AR</button></th>
          <th class="num"><button data-sort="savings">$/yr</button></th>
          <th class="num"><button data-sort="implCost">Cost</button></th>
          <th class="num"><button data-sort="payback">Payback</button></th>
        </tr></thead><tbody></tbody>
        <tfoot><tr><td>Total</td><td class="num">${money(t.savings)}</td><td class="num">${money(t.implCost)}</td><td class="num">${fmt(t.payback, 1)} yr</td></tr></tfoot>
      </table></div><p class="muted small">Tap a column to sort · tap a row to open its AR.</p>` : `<p class="muted">No recommendations this time. Try a hint next round!</p>`}
    </section>

    ${missed.length ? `<section class="card">
      <h2>Missed Findings <span class="count">${missed.length}</span></h2>
      <button id="btn-reveal" class="btn btn-ghost btn-block">Reveal what you missed (${money(totals(missed).savings)}/yr)</button>
      <ul id="missed-list" class="missed" hidden>${missed.map((a) => `
        <li><button data-ar="${a.id}"><span class="arc-chip">${a.arc}</span><span class="mt">${a.title}<small>${zoneName(a.zone)} · ${a.equipment}</small></span><b>${money(evaluate(a).savings)}</b></button></li>`).join('')}</ul>
    </section>` : ''}

    <section class="card">
      <h2>Leaderboard</h2>
      <form id="lb-form" class="lb-form" autocomplete="off">
        <label for="initials">Your initials</label>
        <input id="initials" name="initials" maxlength="3" inputmode="text" autocapitalize="characters" spellcheck="false" placeholder="ABC" required>
        <button class="btn btn-primary" type="submit">Save Score</button>
      </form>
      <div id="lb-list">${boardHTML(loadBoard().slice(0, 10))}</div>
    </section>

    <div class="end-actions">
      <button id="btn-again" class="btn btn-primary btn-xl">Play Again</button>
      <button id="btn-print" class="btn btn-ghost">🖨 Print AR Report</button>
      <button id="btn-home" class="btn btn-ghost">Title Screen</button>
    </div>`;

  renderTable();
  $$('#ar-table th button').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.sort;
    state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : (k === 'arc' || k === 'payback' || k === 'implCost' ? 1 : -1) };
    sfx.click();
    renderTable();
  }));
  $('#ar-table tbody')?.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-ar]');
    if (tr) showARCard(byId[tr.dataset.ar], { live: false });
  });
  $('#btn-reveal')?.addEventListener('click', (e) => {
    sfx.click();
    $('#missed-list').hidden = false;
    e.currentTarget.remove();
  });
  $('#missed-list')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ar]');
    if (b) showARCard(byId[b.dataset.ar], { live: false, missed: true });
  });
  const inp = $('#initials');
  inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3); });
  $('#lb-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const initials = inp.value.trim();
    if (!initials) { inp.focus(); return; }
    const entry = { id: Date.now() + '-' + Math.random().toString(36).slice(2, 6), initials, savings: Math.round(t.savings), finds: list.length, date: new Date().toISOString().slice(0, 10) };
    const board = [...loadBoard(), entry].sort((a, b) => b.savings - a.savings || b.finds - a.finds).slice(0, 10);
    const ok = saveBoard(board);
    state.savedEntry = entry;
    const rank = board.findIndex((x) => x.id === entry.id);
    $('#lb-list').innerHTML = boardHTML(ok ? board : [entry], entry);
    $('#lb-form').innerHTML = `<p class="saved">${rank >= 0 ? `Saved! You're <b>#${rank + 1}</b> on this device.` : 'Saved — but not quite top 10 this time.'}</p>`;
    sfx.cash();
    renderPrint();
  });
  $('#btn-again').addEventListener('click', () => { sfx.click(); startGame(); });
  $('#btn-home').addEventListener('click', () => { sfx.click(); show('screen-title'); });
  $('#btn-print').addEventListener('click', () => { renderPrint(); window.print(); });
}

function renderTable() {
  const tb = $('#ar-table tbody');
  if (!tb) return;
  const { key, dir } = state.sort;
  const rows = state.found.map((id) => ({ ar: byId[id], r: evaluate(byId[id]) }));
  rows.sort((a, b) => {
    const va = key === 'arc' ? a.ar.arc : a.r[key];
    const vb = key === 'arc' ? b.ar.arc : b.r[key];
    return (va > vb ? 1 : va < vb ? -1 : 0) * dir;
  });
  tb.innerHTML = rows.map(({ ar, r }) => `<tr data-ar="${ar.id}">
    <td><span class="arc-chip">${ar.arc}</span><span class="t">${ar.title}</span></td>
    <td class="num">${money(r.savings)}</td><td class="num">${money(r.implCost)}</td><td class="num">${fmt(r.payback, 1)} yr</td></tr>`).join('');
  $$('#ar-table th').forEach((th) => {
    const b = $('button', th);
    th.setAttribute('aria-sort', b.dataset.sort === key ? (dir > 0 ? 'ascending' : 'descending') : 'none');
    b.classList.toggle('sorted', b.dataset.sort === key);
    b.dataset.dir = dir > 0 ? '▲' : '▼';
  });
}

// ======================================================================
//  Printable AR report
// ======================================================================
function renderPrint() {
  const list = state.found.map((id) => byId[id]);
  const t = totals(list);
  const g = gradeFor(list.length, t.savings);
  const who = state.savedEntry ? ` · Assessor: ${esc(state.savedEntry.initials)}` : '';
  $('#print-report').innerHTML = `
    <h1>Plant Walk — Energy Assessment Report</h1>
    <p class="pr-sub">University of Utah · U-CREW Energy Assessment Challenge · ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}${who}</p>
    <p class="pr-sub">Rating: <b>${g.name}</b> · Basis: ${fmt(G.hours)} hr/yr, $${fmt(G.elecRate, 2)}/kWh, $${G.demandRate}/kW-month, $${G.gasRate}/MMBtu</p>
    <table class="pr-sum">
      <tr><th>Total savings</th><th>Electricity</th><th>Natural gas</th><th>Demand</th><th>CO₂e avoided</th><th>Impl. cost</th><th>Payback</th></tr>
      <tr><td>${money(t.savings)}/yr</td><td>${fmt(t.kWh)} kWh/yr</td><td>${fmt(t.mmbtu)} MMBtu/yr</td><td>${fmt(t.kW, 1)} kW</td><td>${fmt(t.co2lb / 2000, 1)} tons/yr</td><td>${money(t.implCost)}</td><td>${list.length ? fmt(t.payback, 1) + ' yr' : '—'}</td></tr>
    </table>
    <h2>Summary of Assessment Recommendations</h2>
    <table class="pr-table"><tr><th>ARC</th><th>Recommendation</th><th>Energy</th><th>$/yr</th><th>Cost</th><th>Payback</th></tr>
      ${list.map((a) => { const r = evaluate(a); return `<tr><td>${a.arc}</td><td>${a.title}</td><td>${r.kWh ? fmt(r.kWh) + ' kWh' : fmt(r.mmbtu) + ' MMBtu'}</td><td>${money(r.savings)}</td><td>${money(r.implCost)}</td><td>${fmt(r.payback, 2)} yr</td></tr>`; }).join('') || '<tr><td colspan="6">No recommendations identified.</td></tr>'}
    </table>
    ${list.map((a, i) => { const r = evaluate(a); return `<div class="pr-ar">
      <h3>AR ${i + 1}: ${a.title} <span>(ARC ${a.arc})</span></h3>
      <p><b>Observed:</b> ${a.observed}</p>
      <p><b>Measurement:</b> ${a.measure.tool} — ${a.measure.label}: ${fmt(a.measure.value, a.measure.decimals)} ${a.measure.unit}</p>
      <p><b>Recommendation:</b> ${a.recommendation}</p>
      <p><b>Results:</b> ${r.kWh ? fmt(r.kWh) + ' kWh/yr · ' : ''}${r.mmbtu ? fmt(r.mmbtu) + ' MMBtu/yr · ' : ''}${fmt(r.kW, 1)} kW · <b>${money(r.savings)}/yr</b> · cost ${money(r.implCost)} (${a.costBasis}) · payback ${fmt(r.payback, 2)} yr</p>
      <ol>${r.lines.map((l) => `<li>${l}</li>`).join('')}</ol></div>`; }).join('')}
    <p class="pr-foot">Estimates are screening-level and ignore interactive effects between measures.</p>`;
}

// ======================================================================
initConfetti($('#confetti'));
updateHUD();
