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
  stage: 1,             // current campaign stage (1-50)
  stageConfig: null,    // stageConfig(stage) while playing the campaign
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
  abilityId: 'issen',   // equipped ability (registry in js/abilities.js)
  abilityKills: 0,      // manual kills toward recharging the ability (0..killsRequired)
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
  if (state.mode === 'stage') return null;
  return state.mode === 'advanced' ? 'samurai-best-advanced' : 'samurai-best';
}

function getBest() {
  if (state.mode === 'stage') return stageBest(state.stage);
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
  state.abilityKills = ABILITIES[state.abilityId].killsRequired;
  updateHud();
  updateAbilityUI();
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

// Start a campaign stage: apply its monster count, wave timer, and mix,
// then run the usual endless-until-you-fall duel.
function startStage(stage) {
  const cfg = stageConfig(stage);
  state.mode = 'stage';
  state.custom = false;
  state.stage = cfg.stage;
  state.stageConfig = cfg;
  state.waveTime = cfg.waveTime;
  state.monsterCount = cfg.monsters;
  startGame();
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
  if (state.mode === 'advanced' || state.mode === 'stage') spawnWave(state.monsterCount);
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
  // In the campaign, every kill past 10 compounds a 1.5% reduction on the
  // base wave timer. It applies to the next wave after the score crosses
  // the threshold, and special-monster time bonuses stack on top as usual.
  const decayStart = state.mode === 'stage'
    ? (state.stageConfig.boss ? BOSS_STAGE_UNLOCK_SCORE : SCORE_TIMER_DECAY_START)
    : 0;
  const decaySteps = state.mode === 'stage'
    ? Math.max(0, state.score - decayStart)
    : 0;
  const decayFactor = Math.pow(1 - SCORE_TIMER_DECAY_RATE, decaySteps);
  state.effectiveTime = Math.round(state.waveTime * decayFactor * waveTimeMultiplier());
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
    registerKill();
    chargeAbility();
    popup(pickCry());
    state.targetIndex++;
    if (state.targetIndex >= state.monsters.length) completeWave();
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
  strikeSlain(el);
}

function strikeSlain(el) {
  if (!el) return;
  el.classList.remove('enter');
  el.classList.add('slain');
  const dead = el;
  setTimeout(() => dead.remove(), 480);
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

  if (state.mode === 'stage') {
    const cfg = state.stageConfig;
    const passed = state.score >= cfg.passScore;
    const nextUnlocked = passed && cfg.stage < STAGE_COUNT;
    $('#over-stage').textContent = `STAGE ${cfg.stage} · ${cfg.blockName}`;
    $('#over-stage').classList.toggle('boss', cfg.boss);
    $('#over-unlock').classList.toggle('success', passed);
    if (nextUnlocked) {
      unlockNextStage(cfg.stage);
      $('#over-unlock').textContent = `CLEARED — STAGE ${cfg.stage + 1} UNLOCKED`;
    } else if (cfg.stage >= STAGE_COUNT && passed) {
      $('#over-unlock').textContent = 'FINAL STAGE MASTERED';
    } else if (cfg.boss) {
      $('#over-unlock').textContent = `NEED ${cfg.passScore} TO PASS BOSS`;
    } else {
      $('#over-unlock').textContent = `NEED ${cfg.passScore} TO UNLOCK NEXT STAGE`;
    }
  } else {
    $('#over-stage').textContent = '';
    $('#over-unlock').textContent = '';
    $('#over-stage').classList.remove('boss');
    $('#over-unlock').classList.remove('success');
  }

  setTimeout(() => {
    clearDemon();
    show('over');
  }, 650);
}

function updateHud() {
  $('#score').textContent = state.score;
  $('#best').textContent = getBest();
  $('#streak').textContent = state.streak;
  $('#stage-num').textContent = state.mode === 'stage'
    ? state.stage
    : state.mode === 'advanced' ? 'ADV' : 'NOR';
}

/* ---- active ability plumbing ---- */
// Shared scoring for any kill (manual strikes and ability slays).
function registerKill() {
  state.score++;
  state.streak++;
  if (state.mode === 'stage') {
    if (recordStageBest(state.stage, state.score)) saveProgress();
  } else if (state.score > getBest()) {
    if (state.mode === 'advanced') state.bestAdvanced = state.score;
    else state.best = state.score;
    localStorage.setItem(bestKey(), state.score);
  }
  updateHud();
}

// Finish a cleared wave exactly like a successful final strike.
function completeWave() {
  state.awaiting = false;
  cancelAnimationFrame(state.rafId);
  clearTimeout(state.deadlineTimer);
  hidePrompt();
  scheduleSpawn();
}

// Manual strikes refill the ability meter (ability slays do not).
function chargeAbility() {
  const ability = ABILITIES[state.abilityId];
  if (state.abilityKills < ability.killsRequired) {
    state.abilityKills = Math.min(ability.killsRequired, state.abilityKills + 1);
    updateAbilityUI();
  }
}

// Generic trigger: guard, spend the charge, then run the ability's effect.
function activateAbility() {
  const ability = ABILITIES[state.abilityId];
  if (!state.playing || !state.awaiting) return;
  if (state.abilityKills < ability.killsRequired) return;
  if (ability.canActivate && !ability.canActivate()) return;
  state.abilityKills = 0;
  updateAbilityUI();
  ability.activate();
}

// Syncs every .ability-btn (touch pad slot + bottom-left FAB): ring fill
// (0–100% of the charge) and the ready/grayed state.
function updateAbilityUI() {
  const ability = ABILITIES[state.abilityId];
  const frac = Math.min(1, state.abilityKills / ability.killsRequired);
  const ready = frac >= 1;
  document.querySelectorAll('.ability-btn').forEach((btn) => {
    btn.classList.toggle('ready', ready);
    btn.setAttribute('aria-disabled', String(!ready));
    const fill = btn.querySelector('.ring-fill');
    if (fill) fill.style.strokeDashoffset = String(100 * (1 - frac));
  });
}

/* ---- input listeners ---- */
window.addEventListener('keydown', (e) => {
  const k = e.key.toUpperCase();
  if (state.screen === 'game' && 'ABCDEFG'.includes(k)) {
    handleKey(k);
    e.preventDefault();
  }
  if (state.screen === 'game' && (e.key === ' ' || e.code === 'Space')) {
    activateAbility();
    e.preventDefault();
  }
  if (e.key === 'Escape' && state.screen === 'game') {
    quitToMenu();
  }
  if (state.screen === 'over' && !e.repeat &&
      (k === 'R' || e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    retryCurrentRun();
  }
});

// On-screen note buttons (touch devices)
document.querySelectorAll('.note-btn[data-note]').forEach((btn) => {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handleKey(btn.dataset.note);
  });
});

// Ability buttons (touch pad slot + bottom-left FAB)
document.querySelectorAll('.ability-btn').forEach((btn) => {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    activateAbility();
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
  show(state.mode === 'stage' ? 'stages' : 'menu');
}

// Retry the current run: same stage in the campaign, same difficulty in
// practice mode.
function retryCurrentRun() {
  if (state.mode === 'stage') startStage(state.stage);
  else startGame();
}
