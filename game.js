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

const ADVANCED_DIFFICULTY = { // monsters per wave + total wave time in ms
  easy:   { monsters: 2, time: 3000 },
  medium: { monsters: 3, time: 3600 },
  hard:   { monsters: 3, time: 2400 },
};

const SPAWN_MIN = 1800;       // random delay before a demon appears (ms)
const SPAWN_MAX = 3600;       // longer, zen-like pauses between demons
const CUSTOM_SPAWN_MIN = 300; // clamp for custom spawn delays (ms)
const CUSTOM_SPAWN_MAX = 8000;
const CUSTOM_SPAWN_SD = 0.3;  // std dev as a fraction of the chosen mean

const PREPARE_MS = 2600;      // calm "ready" phase before the first demon
const ADVANCED_MONSTERS_MIN = 2;
const ADVANCED_MONSTERS_MAX = 5;

/* ------------------------------------------------------------------ */
const OPTIONS_KEY = 'samurai-options';
const OPTIONS_DEFAULTS = {
  cycle: 'fourths',
  sound: true,
  showUI: true,
  touchKeys: 'auto',       // 'auto' | 'show' | 'hide'
  reaction: DIFFICULTY.medium,
  customReaction: 1000,    // last custom slider value, ms
  customSpawnAvg: 2700,    // last custom spawn-average value, ms
  advancedReaction: 3000,  // last advanced custom wave-time value, ms
  advancedSpawnAvg: 3000,  // last advanced custom between-wave value, ms
  advancedMonsters: 3,     // last advanced custom monsters-per-wave value
};

const settings = {
  ...OPTIONS_DEFAULTS,
};

const state = {
  screen: 'menu',
  playing: false,
  custom: false,        // true while playing a custom-difficulty run
  mode: 'normal',       // 'normal' | 'advanced'
  current: null,        // letter currently displayed
  answer: null,         // letter the player must press
  monsters: [],         // active wave: {el, note, answer}
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
  awaiting: false,      // true while a demon is on screen expecting input
};

/* ---- persisted options ---- */
function clampMs(value, min = 300, max = 3000) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clampSpawnMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(5000, Math.max(300, Math.round(n)));
}

function clampMonsterCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(ADVANCED_MONSTERS_MAX, Math.max(ADVANCED_MONSTERS_MIN, Math.round(n)));
}

function loadOptions() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(OPTIONS_KEY));
  } catch (e) { /* missing/corrupt storage → defaults */ }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;

  if (Object.prototype.hasOwnProperty.call(CYCLES, raw.cycle)) {
    settings.cycle = raw.cycle;
  }
  if (typeof raw.showUI === 'boolean') settings.showUI = raw.showUI;
  if (typeof raw.sound === 'boolean') settings.sound = raw.sound;
  if (['auto', 'show', 'hide'].includes(raw.touchKeys)) {
    settings.touchKeys = raw.touchKeys;
  }

  const reaction = clampMs(raw.reaction);
  if (reaction !== null) settings.reaction = reaction;

  const customReaction = clampMs(raw.customReaction);
  if (customReaction !== null) settings.customReaction = customReaction;

  const customSpawnAvg = clampSpawnMs(raw.customSpawnAvg);
  if (customSpawnAvg !== null) settings.customSpawnAvg = customSpawnAvg;

  const advancedReaction = clampMs(raw.advancedReaction, 500, 6000);
  if (advancedReaction !== null) settings.advancedReaction = advancedReaction;

  const advancedSpawnAvg = clampSpawnMs(raw.advancedSpawnAvg);
  if (advancedSpawnAvg !== null) settings.advancedSpawnAvg = advancedSpawnAvg;

  const advancedMonsters = clampMonsterCount(raw.advancedMonsters);
  if (advancedMonsters !== null) settings.advancedMonsters = advancedMonsters;
}

function saveOptions() {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify({
      cycle: settings.cycle,
      showUI: settings.showUI,
      sound: settings.sound,
      touchKeys: settings.touchKeys,
      reaction: settings.reaction,
      customReaction: settings.customReaction,
      customSpawnAvg: settings.customSpawnAvg,
      advancedReaction: settings.advancedReaction,
      advancedSpawnAvg: settings.advancedSpawnAvg,
      advancedMonsters: settings.advancedMonsters,
    }));
  } catch (e) { /* private mode / quota errors should never break play */ }
}

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

function cycleHint() {
  return CYCLES[settings.cycle].join(' → ');
}

function bestKey() {
  return state.mode === 'advanced' ? 'samurai-best-advanced' : 'samurai-best';
}

function getBest() {
  return state.mode === 'advanced' ? state.bestAdvanced : state.best;
}

function startGame() {
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
  const delay = state.custom
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

function spawnDemon() {
  if (!state.playing) return;

  // Each demon carries a random letter (never the same one twice in a row);
  // strike the NEXT note in the cycle.
  const cycle = CYCLES[settings.cycle];
  const options = cycle.filter((note) => note !== state.current);
  const note = options[Math.floor(Math.random() * options.length)];
  state.current = note;
  state.monsters = [{ note, answer: nextLetter(note), el: null }];
  state.targetIndex = 0;
  state.awaiting = true;

  const demon = createDemon(note, 0);
  $('#enemy-zone').appendChild(demon);
  state.monsters[0].el = demon;
  showPrompt();
  startWaveTimer();
}

function spawnWave(count) {
  if (!state.playing) return;

  const notes = pickDistinctNotes(CYCLES[settings.cycle], count, state.current);
  state.monsters = notes.map((note) => ({ note, answer: nextLetter(note), el: null }));
  state.current = notes[notes.length - 1];
  state.targetIndex = 0;
  state.awaiting = true;

  const zone = $('#enemy-zone');
  state.monsters.forEach((monster, depth) => {
    const demon = createDemon(monster.note, depth);
    zone.appendChild(demon);
    monster.el = demon;
  });
  showPrompt();
  startWaveTimer();
}

function pickDistinctNotes(cycle, count, avoid) {
  const pool = cycle.slice();
  const avoidIndex = pool.indexOf(avoid);
  if (avoid && avoidIndex !== -1) pool.splice(avoidIndex, 1);
  const picked = [];
  while (picked.length < count) {
    const i = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(i, 1)[0]);
  }
  return picked;
}

function createDemon(note, depth) {
  const demon = document.createElement('div');
  demon.className = 'demon enter depth-' + depth;
  // appear on the path, roughly centred ahead of the samurai
  const x = 50 + (Math.random() * 16 - 8);      // 42%–58%
  demon.style.left = x + '%';
  demon.innerHTML = `
    <div class="demon-visual">
      <span class="arm l"></span><span class="arm r"></span>
      <span class="leg l"></span><span class="leg r"></span>
      <div class="body">${note}
        <span class="eye l"></span><span class="eye r"></span>
      </div>
      <span class="cut"></span>
    </div>`;
  return demon;
}

function showPrompt() {
  $('#prompt-hint').textContent = cycleHint();
  $('#prompt').classList.add('show');
}

function startWaveTimer() {
  const now = performance.now();
  state.windowStart = now;
  state.windowEnd = now + state.waveTime;
  const fill = $('#timer-fill');
  const track = $('#timer-track');
  track.classList.add('show');
  fill.style.transform = 'scaleX(1)';

  // Authoritative deadline: a timer that fires even if the tab is
  // backgrounded (requestAnimationFrame pauses when not compositing).
  clearTimeout(state.deadlineTimer);
  state.deadlineTimer = setTimeout(timeUp, state.waveTime);

  runTimer();   // visual bar only
}

function runTimer() {
  cancelAnimationFrame(state.rafId);
  const fill = $('#timer-fill');
  const tick = () => {
    const remain = state.windowEnd - performance.now();
    const frac = Math.max(0, remain / state.waveTime);
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

function strikeMonster(el) {
  const sam = $('#samurai');
  sam.classList.remove('strike');
  void sam.offsetWidth;         // reflow to restart animation
  sam.classList.add('strike');
  setTimeout(() => sam.classList.remove('strike'), 240);

  const slash = $('#slash');
  slash.classList.remove('go');
  void slash.offsetWidth;
  slash.classList.add('go');

  if (el) {
    el.classList.remove('enter');
    el.classList.add('slain');
    const dead = el;
    setTimeout(() => dead.remove(), 480);
  }
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

// difficulty tabs
let diffTab = 'normal';
function setDiffTab(tab) {
  if (tab !== 'normal' && tab !== 'advanced') return;
  diffTab = tab;
  document.querySelectorAll('.diff-tab')
    .forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.diff-panel')
    .forEach((p) => p.classList.toggle('active', p.id === 'panel-' + tab));
}

document.querySelectorAll('.diff-tab').forEach((btn) => {
  btn.addEventListener('click', () => setDiffTab(btn.dataset.tab));
});

// swipe between difficulty tabs; ignore swipes that start on a slider
const DIFF_SWIPE_DISTANCE = 60;
let swipeStart = null;
let suppressNextClick = false;
function suppressClickOnce() {
  suppressNextClick = true;
  setTimeout(() => { suppressNextClick = false; }, 600);
}
document.addEventListener('click', (e) => {
  if (suppressNextClick) {
    e.stopPropagation();
    e.preventDefault();
    suppressNextClick = false;
  }
}, true);

const difficultyScreen = $('#screen-difficulty');
difficultyScreen.addEventListener('pointerdown', (e) => {
  if (e.target.closest('input[type="range"]')) return;
  swipeStart = { x: e.clientX, y: e.clientY };
});
difficultyScreen.addEventListener('pointermove', (e) => {
  if (!swipeStart) return;
  const dx = e.clientX - swipeStart.x;
  const dy = e.clientY - swipeStart.y;
  if (Math.abs(dx) >= DIFF_SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5) {
    const next = dx < 0 ? 'advanced' : 'normal';
    if (next !== diffTab) {
      setDiffTab(next);
      suppressClickOnce();
    }
    swipeStart = null;
  }
});
difficultyScreen.addEventListener('pointerup', () => { swipeStart = null; });
difficultyScreen.addEventListener('pointercancel', () => { swipeStart = null; });

// difficulty buttons
document.querySelectorAll('.diff').forEach((btn) => {
  btn.addEventListener('click', () => {
    const d = btn.dataset.diff;
    const mode = btn.dataset.mode || 'normal';
    const panel = mode === 'advanced' ? $('#advanced-custom-panel') : $('#custom-panel');
    if (d === 'custom') {
      panel.classList.toggle('hidden');
      return;
    }
    panel.classList.add('hidden');
    if (mode === 'advanced') {
      const cfg = ADVANCED_DIFFICULTY[d];
      state.mode = 'advanced';
      state.custom = false;
      state.waveTime = cfg.time;
      state.monsterCount = cfg.monsters;
    } else {
      state.mode = 'normal';
      state.custom = false;
      state.waveTime = DIFFICULTY[d];
      state.monsterCount = 1;
    }
    saveOptions();
    startGame();
  });
});

// custom slider
const range = $('#custom-range');
range.addEventListener('input', () => {
  settings.customReaction = Math.round(Number(range.value) * 1000);
  $('#custom-val').textContent = Number(range.value).toFixed(1);
  refreshCustomSummary();
  saveOptions();
});

// custom spawn slider
const spawnRange = $('#custom-spawn');
function refreshCustomSummary() {
  $('#custom-summary').textContent =
    Number(range.value).toFixed(1) + 's window · ' +
    Number(spawnRange.value).toFixed(1) + 's pace';
}
spawnRange.addEventListener('input', () => {
  settings.customSpawnAvg = Math.round(Number(spawnRange.value) * 1000);
  $('#custom-spawn-val').textContent = Number(spawnRange.value).toFixed(1);
  refreshCustomSummary();
  saveOptions();
});
$('#custom-begin').addEventListener('click', () => {
  settings.reaction = Math.round(Number(range.value) * 1000);
  state.mode = 'normal';
  state.custom = true;
  state.waveTime = settings.reaction;
  state.monsterCount = 1;
  saveOptions();
  startGame();
});

// advanced custom controls
const advancedRange = $('#advanced-range');
const advancedSpawnRange = $('#advanced-spawn');
const advancedMonstersRange = $('#advanced-monsters');
function refreshAdvancedSummary() {
  $('#advanced-custom-summary').textContent =
    Number(advancedRange.value).toFixed(1) + 's wave · ' +
    Number(advancedSpawnRange.value).toFixed(1) + 's pace · ' +
    advancedMonstersRange.value + ' monsters';
}
advancedRange.addEventListener('input', () => {
  settings.advancedReaction = Math.round(Number(advancedRange.value) * 1000);
  $('#advanced-val').textContent = Number(advancedRange.value).toFixed(1);
  refreshAdvancedSummary();
  saveOptions();
});
advancedSpawnRange.addEventListener('input', () => {
  settings.advancedSpawnAvg = Math.round(Number(advancedSpawnRange.value) * 1000);
  $('#advanced-spawn-val').textContent = Number(advancedSpawnRange.value).toFixed(1);
  refreshAdvancedSummary();
  saveOptions();
});
advancedMonstersRange.addEventListener('input', () => {
  settings.advancedMonsters = Number(advancedMonstersRange.value);
  $('#advanced-monsters-val').textContent = advancedMonstersRange.value;
  refreshAdvancedSummary();
  saveOptions();
});
$('#advanced-begin').addEventListener('click', () => {
  settings.advancedReaction = Math.round(Number(advancedRange.value) * 1000);
  settings.advancedSpawnAvg = Math.round(Number(advancedSpawnRange.value) * 1000);
  settings.advancedMonsters = Number(advancedMonstersRange.value);
  state.mode = 'advanced';
  state.custom = true;
  state.waveTime = settings.advancedReaction;
  state.monsterCount = settings.advancedMonsters;
  saveOptions();
  startGame();
});

// retry
$('#retry').addEventListener('click', startGame);

// cycle toggle
const cycleDescs = {
  fourths: 'B → E → A → D → G → C → F  (up a fourth)',
  fifths:  'B → F → C → G → D → A → E  (up a fifth)',
};
function refreshCycleDesc() {
  $('#cycle-desc').textContent = cycleDescs[settings.cycle];
  $('#prompt-hint').textContent = cycleHint();
}

document.querySelectorAll('#cycle-toggle .toggle-opt').forEach((b) => {
  b.addEventListener('click', () => {
    settings.cycle = b.dataset.cycle;
    saveOptions();
    document.querySelectorAll('#cycle-toggle .toggle-opt')
      .forEach((x) => x.classList.toggle('active', x === b));
    refreshCycleDesc();
  });
});

document.querySelectorAll('#ui-toggle .toggle-opt').forEach((b) => {
  b.addEventListener('click', () => {
    settings.showUI = b.dataset.ui === 'on';
    saveOptions();
    document.querySelectorAll('#ui-toggle .toggle-opt')
      .forEach((x) => x.classList.toggle('active', x === b));
  });
});

document.querySelectorAll('#sound-toggle .toggle-opt').forEach((b) => {
  b.addEventListener('click', () => {
    settings.sound = b.dataset.sound === 'on';
    saveOptions();
    document.querySelectorAll('#sound-toggle .toggle-opt')
      .forEach((x) => x.classList.toggle('active', x === b));
    if (settings.sound) beep(NOTE_FREQ.A, 0.1);
  });
});

document.querySelectorAll('#touch-toggle .toggle-opt').forEach((b) => {
  b.addEventListener('click', () => {
    settings.touchKeys = b.dataset.touch;
    saveOptions();
    document.querySelectorAll('#touch-toggle .toggle-opt')
      .forEach((x) => x.classList.toggle('active', x === b));
    refreshNotePad();
  });
});

function syncOptionsUI() {
  document.querySelectorAll('#cycle-toggle .toggle-opt')
    .forEach((x) => x.classList.toggle('active', x.dataset.cycle === settings.cycle));
  document.querySelectorAll('#ui-toggle .toggle-opt')
    .forEach((x) => x.classList.toggle('active', x.dataset.ui === (settings.showUI ? 'on' : 'off')));
  document.querySelectorAll('#sound-toggle .toggle-opt')
    .forEach((x) => x.classList.toggle('active', x.dataset.sound === (settings.sound ? 'on' : 'off')));
  document.querySelectorAll('#touch-toggle .toggle-opt')
    .forEach((x) => x.classList.toggle('active', x.dataset.touch === settings.touchKeys));

  range.value = (settings.customReaction / 1000).toFixed(1);
  $('#custom-val').textContent = (settings.customReaction / 1000).toFixed(1);
  spawnRange.value = (settings.customSpawnAvg / 1000).toFixed(1);
  $('#custom-spawn-val').textContent = (settings.customSpawnAvg / 1000).toFixed(1);
  refreshCustomSummary();

  advancedRange.value = (settings.advancedReaction / 1000).toFixed(1);
  $('#advanced-val').textContent = (settings.advancedReaction / 1000).toFixed(1);
  advancedSpawnRange.value = (settings.advancedSpawnAvg / 1000).toFixed(1);
  $('#advanced-spawn-val').textContent = (settings.advancedSpawnAvg / 1000).toFixed(1);
  advancedMonstersRange.value = settings.advancedMonsters;
  $('#advanced-monsters-val').textContent = settings.advancedMonsters;
  refreshAdvancedSummary();
  refreshCycleDesc();
}

/* ================================================================== */
/*  FIT-TO-VIEWPORT SCALING                                           */
/*  The paper is authored at a fixed design size and scaled to fill   */
/*  whatever screen it runs on — tiny laptops up to 4K displays.      */
/* ================================================================== */
const DESIGN = {
  landscape: { w: 960, h: 620 },
  portrait:  { w: 620 },       // height is stretched to fill the screen
};

let currentScale = 1;          // last scale applied by fitToViewport

function fitToViewport() {
  const paper = $('#paper');
  // Layout viewport, not window.inner*, so browser zoom/toolbars can't skew it.
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const portrait = vh > vw;
  document.body.classList.toggle('portrait', portrait);

  let w, h, s;
  if (portrait) {
    // Fill the viewport edge-to-edge: scale by the design width, then
    // stretch the design height to match the phone's aspect ratio.
    w = DESIGN.portrait.w;
    s = vw / w;
    h = Math.round(vh / s);
  } else {
    const d = DESIGN.landscape;
    w = d.w;
    h = d.h;
    const margin = 0.97;       // small breathing room
    s = Math.min(
      (vw * margin) / d.w,
      (vh * margin) / d.h
    );
  }

  paper.style.setProperty('--design-w', w + 'px');
  paper.style.setProperty('--design-h', h + 'px');
  paper.style.transform = `scale(${s})`;
  currentScale = s;
  updatePadSpacer();
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
  updatePadSpacer();
}

// The note pad is fixed to the viewport (unscaled), so reserve its physical
// height inside the scaled paper so the arena never hides behind it.
function updatePadSpacer() {
  const pad = $('#notepad');
  const h = pad.classList.contains('show') ? pad.offsetHeight : 0;
  document.body.style.setProperty('--touch-pad-h-design', (h / currentScale) + 'px');
}

window.addEventListener('resize', fitToViewport);
window.addEventListener('orientationchange', fitToViewport);
['(any-pointer: coarse)', '(any-pointer: fine)'].forEach((query) => {
  const mq = matchMedia(query);
  if (mq.addEventListener) mq.addEventListener('change', refreshNotePad);
  else if (mq.addListener) mq.addListener(refreshNotePad);
});

/* ---- init ---- */
loadOptions();
syncOptionsUI();
$('#best').textContent = getBest();
fitToViewport();
show('menu');
