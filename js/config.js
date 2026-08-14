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

const SKIP_TIME_MODIFIER = 0.3; // extra reaction time (as a fraction of the
                                // base window) added when a skip monster spawns
const REVERSE_TIME_MODIFIER = 0.15; // extra reaction time (as a fraction of the
                                    // base window) added when a reverse monster spawns

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
