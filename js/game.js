/* ====================================================================
   SAMURAI CYCLE — core game logic
   State machine, cycle/note math, spawn scheduling, the reaction timer,
   strike/input handling, and game-over flow. Monster spawning and
   rendering live in monsters.js; screens/options UI in ui.js.
   ==================================================================== */
'use strict';

const state = {
  screen: 'menu',
  playing: false,
  custom: false,        // true while playing a custom-difficulty run
  mode: 'normal',       // 'normal' | 'advanced'
  current: null,        // letter currently displayed
  answer: null,         // letter the player must press
  monsters: [],         // active wave: {type, el, note, answer, ...}
  targetIndex: 0,       // index of the monster the player must strike next
  waveTime: 0,          // total reaction window for the current demon/wave
  monsterCount: 1,      // monsters spawned per wave in advanced mode
  score: 0,
  streak: 0,
  best: Number(localStorage.getItem('samurai-best') || 0),
  bestAdvanced: Number(localStorage.getItem('samurai-best-advanced') || 0),
  spawnTimer: null,
  prepareTimer: null,
  rafId: null,
  deadlineTimer: null,
  windowStart: 0,
  windowEnd: 0,
  effectiveTime: 0,     // base waveTime × the current wave's time multiplier
  awaiting: false,      // true while a demon is on screen expecting input
};

/* ---- element helpers ---- */
const $ = (sel) => document.querySelector(sel);

/* ================================================================== */
/*  FOREST BACKDROP PRELOAD                                           */
/*  The gameplay backdrop is a large webp that CSS paints when it has
    downloaded; until then the arena is plain black. Preload both
    variants on page load, then hold the first countdown until the
    active image is ready so the duel never starts on an empty path.   */
/* ================================================================== */
const FOREST_BACKGROUNDS = {
  portrait: 'sumie_forest.webp',
  landscape: 'sumie_forest_landscape.webp',
};
const forestImages = {};

Object.entries(FOREST_BACKGROUNDS).forEach(([variant, src]) => {
  const img = new Image();
  img.src = src;
  forestImages[variant] = img;
});

// The CSS chooses one of the two images based on the `portrait` body class.
function activeForestImage() {
  return forestImages[
    document.body.classList.contains('portrait') ? 'portrait' : 'landscape'
  ];
}

// Resolves once the active backdrop has finished downloading. A failed
// image also resolves (complete with no pixels) so a broken asset never
// hangs the game — it just falls back to the old black backdrop.
function forestReady() {
  return new Promise((resolve) => {
    const img = activeForestImage();
    if (img.complete) { resolve(); return; }
    img.addEventListener('load', () => resolve(), { once: true });
    img.addEventListener('error', () => resolve(), { once: true });
  });
}

/* ================================================================== */
/*  CYCLE MATH                                                        */
/* ================================================================== */
function nextLetter(letter) {
  const cyc = CYCLES[settings.cycle];
  const i = cyc.indexOf(letter);
  return cyc[(i + 1) % cyc.length];
}

function prevLetter(letter) {
  const cyc = CYCLES[settings.cycle];
  const i = cyc.indexOf(letter);
  return cyc[(i + cyc.length - 1) % cyc.length];
}

function cycleHint() {
  return CYCLES[settings.cycle].join(' → ');
}

function bestKey() {
  return state.mode === 'advanced' ? 'samurai-best-advanced' : 'samurai-best';
}

function getBest() {
  return state.mode === 'advanced' ? state.bestAdvanced : state.best;
}

/* ================================================================== */
/*  GAME FLOW                                                         */
/* ================================================================== */
async function startGame() {
  state.playing = true;
  state.score = 0;
  state.streak = 0;
  state.current = null;     // first demon may carry any letter
  state.monsters = [];
  state.targetIndex = 0;
  updateHud();
  $('#best').textContent = getBest();
  $('#samurai').className = 'idle';
  $('#screen-game').classList.toggle('no-ui', !settings.showUI);
  clearDemon();
  show('game');

  // Hold the countdown until the forest backdrop is actually painted.
  // The popup explains the pause when the image is still downloading.
  if (!activeForestImage().complete) popup('読み込み中 — loading…', true);
  await forestReady();
  if (state.playing) beginPrepare();   // in case the player quit while waiting
}

// Calm "zen" moment before the duel begins: the samurai centres himself,
// then the first demon appears.
function beginPrepare() {
  hidePrompt();
  popup('集中 — ready…');
  clearTimeout(state.prepareTimer);
  state.prepareTimer = setTimeout(() => scheduleSpawn(true), PREPARE_MS);
}

function scheduleSpawn(first = false) {
  const delay = first
    ? FIRST_SPAWN_MIN + Math.random() * (FIRST_SPAWN_MAX - FIRST_SPAWN_MIN)
    : state.custom
      ? randomSpawnDelay(customSpawnMean())
      : SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
  hidePrompt();
  state.spawnTimer = setTimeout(spawnNext, delay);
}

function spawnNext() {
  if (state.mode === 'advanced') spawnWave(state.monsterCount);
  else spawnDemon();
}

function customSpawnMean() {
  return state.mode === 'advanced' ? settings.advancedSpawnAvg : settings.customSpawnAvg;
}

// Custom-mode spawn pacing: a normal distribution around the chosen average,
// clamped so delays stay playable (no instant or absurdly long pauses).
function randomSpawnDelay(mean) {
  const sd = CUSTOM_SPAWN_SD * mean;
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.min(CUSTOM_SPAWN_MAX, Math.max(CUSTOM_SPAWN_MIN, mean + sd * z));
}

/* ================================================================== */
/*  WAVE TIMER                                                        */
/* ================================================================== */
// Monster types can stretch the reaction window: each spawned monster
// contributes its timeModifier, weighted by its share of the wave
// (1/1 in normal mode, 1/count in advanced waves). A lone skip monster
// or reverse monster therefore doubles the window (2×); a 3-monster wave
// with one special monster is stretched by a third of that.
function waveTimeMultiplier() {
  const count = state.monsters.length;
  if (!count) return 1;
  let weighted = 0;
  state.monsters.forEach((monster) => {
    weighted += (monster.timeModifier || 0) / count;
  });
  return 1 + weighted;
}

function showPrompt() {
  $('#prompt-hint').textContent = cycleHint();
  $('#prompt').classList.add('show');
}

function startWaveTimer() {
  const now = performance.now();
  state.effectiveTime = state.waveTime * waveTimeMultiplier();
  state.windowStart = now;
  state.windowEnd = now + state.effectiveTime;
  const fill = $('#timer-fill');
  const track = $('#timer-track');
  track.classList.add('show');
  fill.style.transform = 'scaleX(1)';

  // Authoritative deadline: a timer that fires even if the tab is
  // backgrounded (requestAnimationFrame pauses when not compositing).
  clearTimeout(state.deadlineTimer);
  state.deadlineTimer = setTimeout(timeUp, state.effectiveTime);

  runTimer();   // visual bar only
}

function runTimer() {
  cancelAnimationFrame(state.rafId);
  const fill = $('#timer-fill');
  const tick = () => {
    const remain = state.windowEnd - performance.now();
    const frac = Math.max(0, remain / state.effectiveTime);
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

/* ================================================================== */
/*  INPUT                                                             */
/* ================================================================== */
function handleKey(letter) {
  if (!state.playing || !state.awaiting) return;
  const target = state.monsters[state.targetIndex];
  if (!target) return;

  if (letter === target.answer) {
    // HIT!
    slashSound(letter);
    strikeMonster(target.el);
    state.score++;
    state.streak++;
    if (state.score > getBest()) {
      if (state.mode === 'advanced') state.bestAdvanced = state.score;
      else state.best = state.score;
      localStorage.setItem(bestKey(), state.score);
    }
    updateHud();
    popup(pickCry());
    state.targetIndex++;
    if (state.targetIndex >= state.monsters.length) {
      state.awaiting = false;
      cancelAnimationFrame(state.rafId);
      clearTimeout(state.deadlineTimer);
      hidePrompt();
      scheduleSpawn();
    }
  } else if (target.type === 'skip' && !target.revealed &&
             letter === target.revealKey) {
    // Cut the cover off the skip monster: no score, timer keeps running,
    // and the true demon (showing the next note) is exposed for the kill.
    revealCover(target);
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

// The samurai lunge + screen-wide slash flash; shared by a kill and by
// cutting a skip monster's cover off.
function strikeEffects() {
  const sam = $('#samurai');
  sam.classList.remove('strike');
  void sam.offsetWidth;         // reflow to restart animation
  sam.classList.add('strike');
  setTimeout(() => sam.classList.remove('strike'), 240);

  const slash = $('#slash');
  slash.classList.remove('go');
  void slash.offsetWidth;
  slash.classList.add('go');
}

function strikeMonster(el) {
  strikeEffects();

  if (el) {
    el.classList.remove('enter');
    el.classList.add('slain');
    const dead = el;
    setTimeout(() => dead.remove(), 480);
  }
}

const CRIES = ['斬！', 'SLASH!', '一閃!', 'HA!', '切！'];
function pickCry() { return CRIES[Math.floor(Math.random() * CRIES.length)]; }

function popup(text, persistent = false) {
  const p = $('#popup');
  p.textContent = text;
  p.classList.remove('go');
  void p.offsetWidth;
  p.classList.toggle('loading', persistent);
  p.classList.add('go');
}

function clearDemon() {
  $('#enemy-zone').innerHTML = '';
  state.monsters = [];
  state.targetIndex = 0;
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
  state.monsters.forEach((monster) => {
    if (monster.el && !monster.el.classList.contains('slain')) {
      monster.el.classList.add('wobble');
    }
  });

  $('#over-title').textContent = reason;
  $('#final-score').textContent = state.score;
  $('#final-best').textContent = getBest();

  setTimeout(() => {
    clearDemon();
    show('over');
  }, 650);
}

function updateHud() {
  $('#score').textContent = state.score;
  $('#best').textContent = getBest();
  $('#streak').textContent = state.streak;
}

/* ---- input listeners ---- */
window.addEventListener('keydown', (e) => {
  const k = e.key.toUpperCase();
  if (state.screen === 'game' && 'ABCDEFG'.includes(k)) {
    handleKey(k);
    e.preventDefault();
  }
  if (e.key === 'Escape' && state.screen === 'game') {
    quitToMenu();
  }
  if (state.screen === 'over' && !e.repeat &&
      (k === 'R' || e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    startGame();
  }
});

// On-screen note buttons (touch devices)
document.querySelectorAll('.note-btn').forEach((btn) => {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handleKey(btn.dataset.note);
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
