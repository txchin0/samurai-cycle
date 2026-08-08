/* ====================================================================
   SAMURAI CYCLE — music reaction game
   Given a letter, strike the NEXT letter in the chosen cycle.
     Cycle of FOURTHS : B → E → A → D → G → C → F → (B)
     Cycle of FIFTHS  : B → F → C → G → D → A → E → (B)
   ==================================================================== */
'use strict';

const CYCLES = {
  fourths: ['B', 'E', 'A', 'D', 'G', 'C', 'F'],
  fifths:  ['B', 'F', 'C', 'G', 'D', 'A', 'E'],
};

const DIFFICULTY = {          // reaction window in ms
  easy:   2000,
  medium: 1200,
  hard:    700,
};

const SPAWN_MIN = 1800;       // random delay before a demon appears (ms)
const SPAWN_MAX = 3600;       // longer, zen-like pauses between demons

const PREPARE_MS = 2600;      // calm "ready" phase before the first demon

/* ------------------------------------------------------------------ */
const settings = {
  cycle: 'fourths',
  sound: true,
  showUI: true,
  touchKeys: 'auto',       // 'auto' | 'show' | 'hide'
  reaction: DIFFICULTY.medium,
};

const state = {
  screen: 'menu',
  playing: false,
  current: null,        // letter currently displayed
  answer: null,         // letter the player must press
  score: 0,
  streak: 0,
  best: Number(localStorage.getItem('samurai-best') || 0),
  spawnTimer: null,
  prepareTimer: null,
  rafId: null,
  deadlineTimer: null,
  windowStart: 0,
  windowEnd: 0,
  demonEl: null,
  awaiting: false,      // true while a demon is on screen expecting input
};

/* ---- element helpers ---- */
const $ = (sel) => document.querySelector(sel);
const screens = {
  menu: $('#screen-menu'),
  difficulty: $('#screen-difficulty'),
  options: $('#screen-options'),
  game: $('#screen-game'),
  over: $('#screen-over'),
};

function show(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
  state.screen = name;
  refreshNotePad();
}

/* ================================================================== */
/*  SOUND (tiny WebAudio, no assets)                                  */
/* ================================================================== */
let audioCtx = null;
// frequencies for a pleasant blip per note letter
const NOTE_FREQ = { C:261.6, D:293.7, E:329.6, F:349.2, G:392.0, A:440.0, B:493.9 };

function beep(freq, dur = 0.12, type = 'triangle', vol = 0.18) {
  if (!settings.sound) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur);
  } catch (e) { /* ignore */ }
}
function slashSound(letter) {
  beep(NOTE_FREQ[letter] || 440, 0.14, 'triangle', 0.2);
  beep(120, 0.08, 'sawtooth', 0.08);           // whoosh
}
function failSound() {
  beep(90, 0.35, 'sawtooth', 0.22);
}

/* ================================================================== */
/*  GAME FLOW                                                         */
/* ================================================================== */
function nextLetter(letter) {
  const cyc = CYCLES[settings.cycle];
  const i = cyc.indexOf(letter);
  return cyc[(i + 1) % cyc.length];
}

function startGame() {
  state.playing = true;
  state.score = 0;
  state.streak = 0;
  state.current = CYCLES[settings.cycle][Math.floor(Math.random() * 7)];
  updateHud();
  $('#best').textContent = state.best;
  $('#samurai').className = 'idle';
  $('#screen-game').classList.toggle('no-ui', !settings.showUI);
  clearDemon();
  show('game');
  beginPrepare();
}

// Calm "zen" moment before the duel begins: the samurai centres himself,
// then the first demon appears.
function beginPrepare() {
  hidePrompt();
  popup('集中 — ready…');
  clearTimeout(state.prepareTimer);
  state.prepareTimer = setTimeout(scheduleSpawn, PREPARE_MS);
}

function scheduleSpawn() {
  const delay = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
  hidePrompt();
  state.spawnTimer = setTimeout(spawnDemon, delay);
}

function spawnDemon() {
  if (!state.playing) return;

  state.answer = nextLetter(state.current);
  state.awaiting = true;

  // build demon element
  const zone = $('#enemy-zone');
  const demon = document.createElement('div');
  demon.className = 'demon enter';
  // appear on the path, roughly centred ahead of the samurai
  const x = 50 + (Math.random() * 16 - 8);      // 42%–58%
  demon.style.left = x + '%';
  demon.innerHTML = `
    <span class="arm l"></span><span class="arm r"></span>
    <span class="leg l"></span><span class="leg r"></span>
    <div class="body">${state.current}
      <span class="eye l"></span><span class="eye r"></span>
    </div>
    <span class="cut"></span>`;
  zone.appendChild(demon);
  state.demonEl = demon;

  // show prompt
  $('#prompt-cur').textContent = state.current;
  $('#prompt-hint').textContent = 'strike ' + state.answer;
  $('#prompt').classList.add('show');

  // start reaction timer
  const now = performance.now();
  state.windowStart = now;
  state.windowEnd = now + settings.reaction;
  const fill = $('#timer-fill');
  const track = $('#timer-track');
  track.classList.add('show');
  fill.style.transform = 'scaleX(1)';

  // Authoritative deadline: a timer that fires even if the tab is
  // backgrounded (requestAnimationFrame pauses when not compositing).
  clearTimeout(state.deadlineTimer);
  state.deadlineTimer = setTimeout(timeUp, settings.reaction);

  runTimer();   // visual bar only
}

function runTimer() {
  cancelAnimationFrame(state.rafId);
  const fill = $('#timer-fill');
  const tick = () => {
    const remain = state.windowEnd - performance.now();
    const frac = Math.max(0, remain / settings.reaction);
    fill.style.transform = `scaleX(${frac})`;
    if (remain > 0 && state.awaiting) {
      state.rafId = requestAnimationFrame(tick);
    }
  };
  state.rafId = requestAnimationFrame(tick);
}

function hidePrompt() {
  $('#prompt').classList.remove('show');
  $('#timer-track').classList.remove('show');
}

function handleKey(letter) {
  if (!state.playing || !state.awaiting) return;
  state.awaiting = false;
  cancelAnimationFrame(state.rafId);
  clearTimeout(state.deadlineTimer);

  if (letter === state.answer) {
    // HIT!
    slashSound(letter);
    strike();
    state.score++;
    state.streak++;
    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem('samurai-best', state.best);
    }
    updateHud();
    popup(pickCry());
    // chain: the letter we just played becomes the new "current"
    state.current = letter;
    scheduleSpawn();
  } else {
    // wrong note
    gameOver('WRONG STRIKE');
  }
}

function timeUp() {
  if (!state.awaiting) return;
  state.awaiting = false;
  gameOver('TOO SLOW');
}

function strike() {
  const sam = $('#samurai');
  sam.classList.remove('strike');
  void sam.offsetWidth;         // reflow to restart animation
  sam.classList.add('strike');
  setTimeout(() => sam.classList.remove('strike'), 240);

  const slash = $('#slash');
  slash.classList.remove('go');
  void slash.offsetWidth;
  slash.classList.add('go');

  if (state.demonEl) {
    state.demonEl.classList.remove('enter');
    state.demonEl.classList.add('slain');
    const dead = state.demonEl;
    setTimeout(() => dead.remove(), 480);
    state.demonEl = null;
  }
  hidePrompt();
}

const CRIES = ['斬！', 'SLASH!', '一閃!', 'HA!', '切！'];
function pickCry() { return CRIES[Math.floor(Math.random() * CRIES.length)]; }

function popup(text) {
  const p = $('#popup');
  p.textContent = text;
  p.classList.remove('go');
  void p.offsetWidth;
  p.classList.add('go');
}

function clearDemon() {
  $('#enemy-zone').innerHTML = '';
  state.demonEl = null;
}

function gameOver(reason) {
  state.playing = false;
  state.awaiting = false;
  clearTimeout(state.spawnTimer);
  clearTimeout(state.prepareTimer);
  clearTimeout(state.deadlineTimer);
  cancelAnimationFrame(state.rafId);
  failSound();
  hidePrompt();

  // samurai falls, demon lands a hit
  $('#samurai').classList.add('fall');
  if (state.demonEl) state.demonEl.classList.add('wobble');

  $('#over-title').textContent = reason;
  $('#final-score').textContent = state.score;
  $('#final-best').textContent = state.best;

  setTimeout(() => {
    clearDemon();
    show('over');
  }, 650);
}

function updateHud() {
  $('#score').textContent = state.score;
  $('#best').textContent = state.best;
  $('#streak').textContent = state.streak;
}

/* ================================================================== */
/*  INPUT                                                             */
/* ================================================================== */
window.addEventListener('keydown', (e) => {
  const k = e.key.toUpperCase();
  if (state.screen === 'game' && 'ABCDEFG'.includes(k)) {
    handleKey(k);
    e.preventDefault();
  }
  if (e.key === 'Escape' && state.screen === 'game') {
    quitToMenu();
  }
});

// On-screen note buttons (touch devices)
document.querySelectorAll('.note-btn').forEach((btn) => {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handleKey(btn.dataset.note);
  });
});

/* ================================================================== */
/*  MENU / OPTIONS WIRING                                             */
/* ================================================================== */
// generic navigation buttons
document.querySelectorAll('[data-go]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.go;
    if (target === 'menu') { quitToMenu(); return; }
    show(target);
  });
});

function quitToMenu() {
  state.playing = false;
  clearTimeout(state.spawnTimer);
  clearTimeout(state.prepareTimer);
  clearTimeout(state.deadlineTimer);
  cancelAnimationFrame(state.rafId);
  clearDemon();
  $('#samurai').className = 'idle';
  show('menu');
}

// difficulty buttons
document.querySelectorAll('.diff').forEach((btn) => {
  btn.addEventListener('click', () => {
    const d = btn.dataset.diff;
    const panel = $('#custom-panel');
    if (d === 'custom') {
      panel.classList.toggle('hidden');
      return;
    }
    panel.classList.add('hidden');
    settings.reaction = DIFFICULTY[d];
    startGame();
  });
});

// custom slider
const range = $('#custom-range');
range.addEventListener('input', () => {
  $('#custom-val').textContent = Number(range.value).toFixed(1);
  $('#custom-summary').textContent = Number(range.value).toFixed(1) + 's window';
});
$('#custom-begin').addEventListener('click', () => {
  settings.reaction = Math.round(Number(range.value) * 1000);
  startGame();
});

// retry
$('#retry').addEventListener('click', startGame);

// cycle toggle
const cycleDescs = {
  fourths: 'B → E → A → D → G → C → F  (up a fourth)',
  fifths:  'B → F → C → G → D → A → E  (up a fifth)',
};
function refreshCycleDesc() { $('#cycle-desc').textContent = cycleDescs[settings.cycle]; }

document.querySelectorAll('#cycle-toggle .toggle-opt').forEach((b) => {
  b.addEventListener('click', () => {
    settings.cycle = b.dataset.cycle;
    document.querySelectorAll('#cycle-toggle .toggle-opt')
      .forEach((x) => x.classList.toggle('active', x === b));
    refreshCycleDesc();
  });
});

document.querySelectorAll('#ui-toggle .toggle-opt').forEach((b) => {
  b.addEventListener('click', () => {
    settings.showUI = b.dataset.ui === 'on';
    document.querySelectorAll('#ui-toggle .toggle-opt')
      .forEach((x) => x.classList.toggle('active', x === b));
  });
});

document.querySelectorAll('#sound-toggle .toggle-opt').forEach((b) => {
  b.addEventListener('click', () => {
    settings.sound = b.dataset.sound === 'on';
    document.querySelectorAll('#sound-toggle .toggle-opt')
      .forEach((x) => x.classList.toggle('active', x === b));
    if (settings.sound) beep(NOTE_FREQ.A, 0.1);
  });
});

document.querySelectorAll('#touch-toggle .toggle-opt').forEach((b) => {
  b.addEventListener('click', () => {
    settings.touchKeys = b.dataset.touch;
    document.querySelectorAll('#touch-toggle .toggle-opt')
      .forEach((x) => x.classList.toggle('active', x === b));
    refreshNotePad();
  });
});

/* ================================================================== */
/*  FIT-TO-VIEWPORT SCALING                                           */
/*  The paper is authored at a fixed design size and scaled to fill   */
/*  whatever screen it runs on — tiny laptops up to 4K displays.      */
/* ================================================================== */
const DESIGN = {
  landscape: { w: 960, h: 620 },
  portrait:  { w: 620, h: 1240 },
};

function fitToViewport() {
  const paper = $('#paper');
  const portrait = window.innerHeight > window.innerWidth;
  const d = DESIGN[portrait ? 'portrait' : 'landscape'];
  document.body.classList.toggle('portrait', portrait);
  paper.style.setProperty('--design-w', d.w + 'px');
  paper.style.setProperty('--design-h', d.h + 'px');

  const margin = 0.97;                       // small breathing room
  const s = Math.min(
    (window.innerWidth  * margin) / d.w,
    (window.innerHeight * margin) / d.h
  );
  paper.style.transform = `scale(${s})`;
}

/* ================================================================== */
/*  TOUCH KEYS                                                        */
/*  No browser can reliably detect a physical keyboard, so AUTO uses  */
/*  pointer heuristics: any coarse pointer and no fine pointer means  */
/*  a phone/tablet without a keyboard or mouse. SHOW/HIDE override.   */
/* ================================================================== */
function prefersTouchKeys() {
  if (settings.touchKeys !== 'auto') return settings.touchKeys === 'show';
  return (
    matchMedia('(any-pointer: coarse)').matches &&
    !matchMedia('(any-pointer: fine)').matches
  );
}

function refreshNotePad() {
  const showPad = state.screen === 'game' && prefersTouchKeys();
  $('#notepad').classList.toggle('show', showPad);
  document.body.classList.toggle('touch-keys', showPad);
}

window.addEventListener('resize', fitToViewport);
window.addEventListener('orientationchange', fitToViewport);
['(any-pointer: coarse)', '(any-pointer: fine)'].forEach((query) => {
  const mq = matchMedia(query);
  if (mq.addEventListener) mq.addEventListener('change', refreshNotePad);
  else if (mq.addListener) mq.addListener(refreshNotePad);
});

/* ---- init ---- */
$('#best').textContent = state.best;
refreshCycleDesc();
fitToViewport();
show('menu');
