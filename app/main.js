// Application layer / composition root. Wires the sensor adapter to the domain
// logic and the presentation layer, owns the interaction loops, and bootstraps.

import { CFG, TREE } from './config.js';
import { S } from './state.js';
import { computeThreshold, isDeliberateBlink, pointInRect, median } from './signal.js';
import { speak } from './speech.js';
import * as view from './view.js';
import * as camera from './camera.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- selection / navigation ---------- */
function activate(card, via){
  const now = performance.now();
  const node = card._node, isNav = !!(node.children || node.back);
  // cooldown gates spoken selections only; navigating menus stays snappy (manual click always allowed)
  if (!isNav && now - S.lastSelect < CFG.cooldownMs && via !== 'touch/click') return;
  S.armed = false; view.resetRing();
  if (via === 'blink' && !S.fallback && camera.hasTrainingApi()) trainOnSelection(card);
  if (node.children){ enterView(node.children, node.t); return; }   // drill into a category
  if (node.back){ enterView(TREE, null); return; }                  // back to the main board
  // leaf: speak + log
  S.lastSelect = now;                                               // start the cooldown only on a spoken selection
  speak(node.say);
  view.toast('Spoke: "' + node.say + '"');
  view.logSelection(node.say, via);
  view.fireCard(card);
}

function enterView(nodes, title){
  view.renderBoard(nodes, title, activate);
  // fresh view: drop any in-progress gaze/blink so nothing fires on the way in
  S.gazeCard = S.candCard = S.blinkGazeCard = null; S.closedSince = null; S.armed = false; view.resetRing();
}

// Online learning: feed the chosen card's centre back to WebGazer so gaze accuracy improves with use.
function trainOnSelection(card){
  const r = card.getBoundingClientRect(), x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
  for (let i = 0; i < 6; i++) camera.recordPoint(x, y);
}

/* ---------- gaze interaction: median filter, magnetic snap, cursor glide ---------- */
const gazeBuf = [];
const mouseGaze = e => onGaze(e.clientX, e.clientY);
function onGaze(x, y){
  S.rawX = x; S.rawY = y;
  gazeBuf.push([x, y]); if (gazeBuf.length > CFG.medianN) gazeBuf.shift();
  S.gx = median(gazeBuf.map(p => p[0]));
  S.gy = median(gazeBuf.map(p => p[1]));
}
function nearestCard(x, y){
  let best = null, bd = Infinity;
  for (const c of view.cards){
    const r = c.getBoundingClientRect();
    const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2), d = dx * dx + dy * dy;
    if (d < bd){ bd = d; best = c; }
  }
  return best;
}
function settledCard(){ return (S.gazeCard && performance.now() - S.gazeCardSince >= CFG.settleMs) ? S.gazeCard : null; }

function uiLoop(){
  if (!S.tracking && !S.fallback){ S.rafUi = null; return; }
  const now = performance.now();
  // Magnetic snap: pick the card nearest the gaze, debounce the switch so jitter can't flip it,
  // and never snap from outside the board (controls, log) so a blink away can't select.
  const raw = pointInRect(S.rawX, S.rawY, view.els.board.getBoundingClientRect()) ? nearestCard(S.gx, S.gy) : null;
  if (raw !== S.candCard){ S.candCard = raw; S.candSince = now; }
  if (!S.candCard){ S.gazeCard = null; S.gazeCardSince = 0; }
  if (S.candCard && (S.gazeCard === null || (S.candCard !== S.gazeCard && now - S.candSince >= CFG.switchMs))){
    S.gazeCard = S.candCard; S.gazeCardSince = now;
  }
  const card = S.gazeCard;
  if (card){
    const r = card.getBoundingClientRect();
    S.cx += (r.left + r.width / 2 - S.cx) * CFG.ease;   // dampened glide toward the snapped centre
    S.cy += (r.top + r.height / 2 - S.cy) * CFG.ease;
  }
  view.paintGaze(card, S.cx, S.cy);
  S.rafUi = requestAnimationFrame(uiLoop);
}
function startUiLoop(){ if (!S.rafUi) uiLoop(); }

/* ---------- blink finite-state machine ---------- */
function handleBlink(bothClosed, bothOpen, now){
  if (!S.armed){ if (bothOpen) S.armed = true; view.resetRing(); return; }   // must fully reopen before re-arming
  if (bothClosed){
    if (S.closedSince == null){ S.closedSince = now; S.blinkGazeCard = settledCard(); }
    if (S.blinkGazeCard) view.showRing(S.blinkGazeCard, (now - S.closedSince) / S.blinkMinMs);
  } else if (S.closedSince != null){                                         // reopen edge -> decide
    const dur = now - S.closedSince;
    if (isDeliberateBlink(dur, S.blinkMinMs, CFG.maxBlinkMs) && S.blinkGazeCard && now - S.lastSelect >= CFG.cooldownMs){
      activate(S.blinkGazeCard, 'blink');
    }
    S.closedSince = null; S.blinkGazeCard = null; view.resetRing();
  } else { view.resetRing(); }
}

// Per-frame eye signal from the camera: calibration sampling, then threshold + FSM.
function onFrame({ present, left, right, now }){
  if (!present){
    if (S.faceLostSince == null) S.faceLostSince = now;
    else if (now - S.faceLostSince > CFG.faceLostMs){
      view.setStatus('Face not detected — selection paused. Check lighting and face the camera.', 'warn');
      S.closedSince = null; S.armed = false; view.resetRing();
    }
    return;
  }
  S.faceLostSince = null;
  if (S.cal.calibrating){ S.cal.samples.push((left + right) / 2); return; }
  if (S.cal.threshold == null){ view.setStatus('Blink not calibrated — please recalibrate.', 'warn'); return; }
  const th = S.cal.threshold, open = th * 0.6;                                // hysteresis band
  handleBlink(left >= th && right >= th, left < open && right < open, now);
  const k = view.statusKind();
  if (k === 'warn' || k === 'muted') view.setStatus('Tracking OK.', 'ok');
}

/* ---------- camera lifecycle (controller orchestrates UI + adapter) ---------- */
async function startTracking(){
  view.setStatus('Starting camera…'); view.setTrackDisabled(true);
  const res = await camera.start({ onGaze, onFrame });
  if (!res.ok) return enterFallback(res.reason);
  view.mountPreview(camera.getStream());
  S.tracking = true; S.fallback = false;
  window.removeEventListener('mousemove', mouseGaze);
  view.showCursor(true);
  view.setTrackButton('Stop camera'); view.setTrackDisabled(false); view.setRecalDisabled(false);
  startUiLoop();
  await runCalibration();
}

// Camera/WebGazer failed. Fall back to mouse-position gaze; blink is unavailable.
function enterFallback(reason){
  camera.stop();
  view.clearPreview();
  S.fallback = true; S.tracking = false;
  view.showCursor(true);
  view.setStatus('Camera unavailable — using mouse position as gaze. Blink selection is off; look at a card and press Space, or click.' + (reason ? ' [' + reason + ']' : ''), 'warn');
  view.setTrackButton('Stop'); view.setTrackDisabled(false); view.setRecalDisabled(true);
  window.removeEventListener('mousemove', mouseGaze);
  window.addEventListener('mousemove', mouseGaze);
  startUiLoop();
}

function stopTracking(){
  S.tracking = false; S.fallback = false;
  if (S.rafUi){ cancelAnimationFrame(S.rafUi); S.rafUi = null; }
  window.removeEventListener('mousemove', mouseGaze);
  camera.stop();
  view.showCursor(false); view.resetRing(); view.clearPreview(); view.clearGaze();
  view.setTrackButton('Start camera'); view.setRecalDisabled(true);
  view.setStatus('Camera off. Start the camera to use gaze and blink selection.');
}

/* ---------- calibration ---------- */
async function runGazeCalibration(){
  if (S.fallback || !camera.hasTrainingApi()) return;
  // 4x3 grid walked in a snake order, so the dot always moves to an adjacent spot.
  const cols = [.1, .37, .63, .9], rows = [.14, .5, .86], pts = [];
  rows.forEach((fy, ri) => { (ri % 2 ? [...cols].reverse() : cols).forEach(fx => pts.push([fx, fy])); });
  view.setCal('Gaze setup — look straight at each dot until it moves.');
  for (const [fx, fy] of pts){
    const x = Math.round(fx * innerWidth), y = Math.round(fy * innerHeight);
    view.moveCalDot(x, y);
    await sleep(650);                                   // let the eyes land on the dot
    for (let i = 0; i < 32; i++){ camera.recordPoint(x, y); await sleep(35); }
  }
  view.hideCalDot();
}

async function runCalibration(){
  if (S.fallback) return;
  view.showCal();
  await runGazeCalibration();
  const collect = async (label, ms) => {
    S.cal.samples = []; S.cal.calibrating = true;
    for (let s = Math.ceil(ms / 1000); s > 0; s--){ view.setCal(label, s); await sleep(1000); }
    S.cal.calibrating = false;
    return S.cal.samples.length ? S.cal.samples.reduce((a, b) => a + b, 0) / S.cal.samples.length : 0;
  };
  view.setCal('Look at the screen with your eyes open and relaxed.', '3'); await sleep(900);
  const open = await collect('Keep your eyes open…', 2000);
  const closed = await collect('Now gently close both eyes…', 2000);
  const th = computeThreshold(open, closed);
  S.cal.open = open; S.cal.closed = closed; S.cal.threshold = th;
  view.hideCal();
  if (th == null) view.setStatus('Calibration unclear (low eye-closure separation). Try better lighting and recalibrate.', 'warn');
  else { view.setStatus('Calibrated. Tracking OK.', 'ok'); view.toast('Blink calibrated'); }
}

/* ---------- controls + keyboard ---------- */
view.els.btnTrack.addEventListener('click', () => { (S.tracking || S.fallback) ? stopTracking() : startTracking(); });
view.els.btnRecal.addEventListener('click', () => { if (S.tracking) runCalibration(); });
view.els.calSkip.addEventListener('click', () => {
  S.cal.calibrating = false; S.cal.threshold = computeThreshold(0.05, 0.6); view.hideCal();
  view.setStatus('Using default blink calibration. Recalibrate for best results.', 'warn');
});
view.els.blinkDur.addEventListener('input', () => { S.blinkMinMs = +view.els.blinkDur.value; view.setBlinkLabel(view.els.blinkDur.value); });

document.addEventListener('keydown', e => {
  if (e.key === ' '){
    const target = settledCard() || S.gazeCard || (document.activeElement.classList?.contains('card') ? document.activeElement : null);
    if (target){ e.preventDefault(); activate(target, 'keyboard'); }
  } else if (e.key === 'Enter'){
    const f = document.activeElement;
    if (f && f.classList && f.classList.contains('card')){ e.preventDefault(); activate(f, 'keyboard'); }
  }
});
window.addEventListener('resize', () => {
  S.rawX = Math.min(S.rawX, innerWidth); S.rawY = Math.min(S.rawY, innerHeight);
  S.gx = Math.min(S.gx, innerWidth); S.gy = Math.min(S.gy, innerHeight);
});

enterView(TREE, null);   // draw the main board

/* ---------- self-test (?selftest) ---------- */
if (location.search.includes('selftest')){
  const a = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok:', m); };
  a(computeThreshold(0.05, 0.7) > 0.05 && computeThreshold(0.05, 0.7) < 0.7, 'threshold between open/closed');
  a(computeThreshold(0.4, 0.45) === null, 'rejects low separation');
  a(isDeliberateBlink(500, 500, 3000) && !isDeliberateBlink(150, 500, 3000) && !isDeliberateBlink(4000, 500, 3000), 'blink duration window');
  a(pointInRect(50, 50, { left:0, top:0, right:100, bottom:100 }) && !pointInRect(101, 50, { left:0, top:0, right:100, bottom:100 }), 'gaze target is limited to board bounds');
  a(median([100, 102, 900, 101, 99]) === 101, 'median drops gaze outliers');
  console.log('selftest passed');
}
