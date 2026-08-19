/* ====================================================================
   SAMURAI CYCLE — configuration
   Cycle definitions, difficulty tables, spawn pacing, and the persisted
   options blob (loadOptions / saveOptions). Loaded first: everything
   else reads `settings` from here.
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

/* ---- 50-stage campaign ----
   Five teaching blocks of ten stages:
   BASICS (1-10) → SKIP (11-20) → WAVES (21-30) →
   REVERSE (31-40) → COMBINED (41-50).

   `budget` is the reaction time budget per demon in ms. The wave timer is
   budget × monsters (rounded to 10 ms). Special-monster time bonuses are
   applied on top at runtime by waveTimeMultiplier(). */
const STAGE_COUNT = 50;
const STAGE_UNLOCK_SCORE = 10;
const BOSS_STAGE_UNLOCK_SCORE = 20;
const SCORE_TIMER_DECAY_RATE = 0.015;   // per score past 10 in stage mode
const SCORE_TIMER_DECAY_START = STAGE_UNLOCK_SCORE;

const STAGE_BLOCK_NAMES = ['BASICS', 'SKIP', 'WAVES', 'REVERSE', 'COMBINED'];

const STAGE_MONSTERS = [
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // 1-10
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // 11-20
  2, 2, 3, 3, 4, 4, 5, 5, 5, 5, // 21-30
  4, 4, 5, 5, 5, 5, 5, 5, 5, 5, // 31-40
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5, // 41-50
];

const STAGE_BUDGET_MS = [
  3000, 2900, 2800, 2700, 2600, 2500, 2400, 2300, 2200, 1200, // 1-10
  2600, 2500, 2400, 2300, 2200, 2100, 2000, 1900, 1800, 1000, // 11-20
  1700, 1600, 1500, 1400, 1300, 1200, 1100, 1000, 900, 600,   // 21-30
  1100, 1050, 1000, 950, 900, 850, 800, 750, 700, 550,        // 31-40
  800, 775, 750, 725, 700, 675, 650, 625, 600, 450,           // 41-50
];

const STAGE_SKIP_PERCENT = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,          // 1-10
  10, 12, 15, 18, 20, 22, 25, 28, 30, 40, // 11-20
  32, 34, 36, 38, 40, 42, 44, 46, 48, 50, // 21-30
  45, 45, 46, 46, 47, 47, 48, 48, 49, 50, // 31-40
  45, 46, 47, 48, 49, 50, 50, 50, 50, 50, // 41-50
];

const STAGE_REVERSE_PERCENT = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,          // 1-10
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,          // 11-20
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,          // 21-30
  10, 12, 14, 16, 18, 20, 22, 24, 26, 30, // 31-40
  30, 31, 32, 33, 34, 35, 36, 37, 38, 40, // 41-50
];

function clampStage(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(STAGE_COUNT, Math.max(1, Math.round(n)));
}

function stageConfig(stage) {
  const n = clampStage(stage);
  const i = n - 1;
  const monsters = STAGE_MONSTERS[i];
  const budget = STAGE_BUDGET_MS[i];
  return {
    stage: n,
    boss: n % 10 === 0,
    block: Math.floor(i / 10) + 1,
    blockName: STAGE_BLOCK_NAMES[Math.floor(i / 10)],
    monsters,
    budget,
    waveTime: Math.round((budget * monsters) / 10) * 10,
    skipChance: STAGE_SKIP_PERCENT[i] / 100,
    reverseChance: STAGE_REVERSE_PERCENT[i] / 100,
    passScore: n % 10 === 0 ? BOSS_STAGE_UNLOCK_SCORE : STAGE_UNLOCK_SCORE,
  };
}

/* ---- stage campaign progress ---- */
const PROGRESS_KEY = 'samurai-progress';
const progress = {
  unlockedStage: 1,
  stageBests: {},   // stage number → best score
};

function loadProgress() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(PROGRESS_KEY));
  } catch (e) { /* missing/corrupt storage → fresh campaign */ }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;

  if (raw.unlockedStage !== undefined) {
    progress.unlockedStage = clampStage(raw.unlockedStage);
  }

  if (raw.stageBests && typeof raw.stageBests === 'object' && !Array.isArray(raw.stageBests)) {
    progress.stageBests = {};
    Object.entries(raw.stageBests).forEach(([key, value]) => {
      const stage = Number(key);
      const score = Number(value);
      if (Number.isFinite(stage) && Number.isFinite(score)) {
        progress.stageBests[clampStage(stage)] = Math.max(0, Math.floor(score));
      }
    });
  }
}

function saveProgress() {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({
      unlockedStage: progress.unlockedStage,
      stageBests: progress.stageBests,
    }));
  } catch (e) { /* private mode / quota errors should never break play */ }
}

function stageBest(stage) {
  return progress.stageBests[clampStage(stage)] || 0;
}

function recordStageBest(stage, score) {
  const n = clampStage(stage);
  const s = Math.max(0, Math.floor(score));
  if (s > (progress.stageBests[n] || 0)) {
    progress.stageBests[n] = s;
    return true;
  }
  return false;
}

function unlockNextStage(currentStage) {
  const next = clampStage(currentStage) + 1;
  if (next <= STAGE_COUNT && next > progress.unlockedStage) {
    progress.unlockedStage = next;
    saveProgress();
    return true;
  }
  return false;
}

const SPAWN_MIN = 1800;       // random delay before a demon appears (ms)
const SPAWN_MAX = 3600;       // longer, zen-like pauses between demons
const FIRST_SPAWN_MIN = 700;  // random delay before the FIRST demon (ms)
const FIRST_SPAWN_MAX = 1300;
const CUSTOM_SPAWN_MIN = 300; // clamp for custom spawn delays (ms)
const CUSTOM_SPAWN_MAX = 8000;
const CUSTOM_SPAWN_SD = 0.3;  // std dev as a fraction of the chosen mean

const PREPARE_MS = 1000;      // brief "ready" moment before the first demon
const ADVANCED_MONSTERS_MIN = 2;
const ADVANCED_MONSTERS_MAX = 5;

const SKIP_TIME_MODIFIER = 1;   // extra reaction time (as a fraction of the
                                // base window) added when a skip monster spawns;
                                // 1 = a lone skip monster doubles the window (2×)
const REVERSE_TIME_MODIFIER = 1; // extra reaction time (as a fraction of the
                                 // base window) added when a reverse monster spawns;
                                 // 1 = a lone reverse monster doubles the window (2×)

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
  customSkipChance: 0.1,   // custom normal-mode skip-monster chance
  customReverseChance: 0.1, // custom normal-mode reverse-monster chance
  advancedReaction: 3000,  // last advanced custom wave-time value, ms
  advancedSpawnAvg: 3000,  // last advanced custom between-wave value, ms
  advancedMonsters: 3,     // last advanced custom monsters-per-wave value
  advancedSkipChance: 0.1,   // custom advanced-mode skip-monster chance
  advancedReverseChance: 0.1, // custom advanced-mode reverse-monster chance
  skipMonsterChance: 0.1,  // fraction of spawns that are skip monsters
  reverseMonsterChance: 0.1, // fraction of spawns that are reverse monsters
};

const settings = {
  ...OPTIONS_DEFAULTS,
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

function clampFraction(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n));
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

  const customSkipChance = clampFraction(raw.customSkipChance);
  if (customSkipChance !== null) settings.customSkipChance = customSkipChance;

  const customReverseChance = clampFraction(raw.customReverseChance);
  if (customReverseChance !== null) settings.customReverseChance = customReverseChance;

  const advancedReaction = clampMs(raw.advancedReaction, 500, 6000);
  if (advancedReaction !== null) settings.advancedReaction = advancedReaction;

  const advancedSpawnAvg = clampSpawnMs(raw.advancedSpawnAvg);
  if (advancedSpawnAvg !== null) settings.advancedSpawnAvg = advancedSpawnAvg;

  const advancedMonsters = clampMonsterCount(raw.advancedMonsters);
  if (advancedMonsters !== null) settings.advancedMonsters = advancedMonsters;

  const advancedSkipChance = clampFraction(raw.advancedSkipChance);
  if (advancedSkipChance !== null) settings.advancedSkipChance = advancedSkipChance;

  const advancedReverseChance = clampFraction(raw.advancedReverseChance);
  if (advancedReverseChance !== null) settings.advancedReverseChance = advancedReverseChance;

  const skipMonsterChance = clampFraction(raw.skipMonsterChance);
  if (skipMonsterChance !== null) settings.skipMonsterChance = skipMonsterChance;

  const reverseMonsterChance = clampFraction(raw.reverseMonsterChance);
  if (reverseMonsterChance !== null) settings.reverseMonsterChance = reverseMonsterChance;
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
      customSkipChance: settings.customSkipChance,
      customReverseChance: settings.customReverseChance,
      advancedReaction: settings.advancedReaction,
      advancedSpawnAvg: settings.advancedSpawnAvg,
      advancedMonsters: settings.advancedMonsters,
      advancedSkipChance: settings.advancedSkipChance,
      advancedReverseChance: settings.advancedReverseChance,
      skipMonsterChance: settings.skipMonsterChance,
      reverseMonsterChance: settings.reverseMonsterChance,
    }));
  } catch (e) { /* private mode / quota errors should never break play */ }
}
