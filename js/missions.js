/* ====================================================================
   SAMURAI CYCLE — daily missions
   Three missions are rolled each day from MISSION_POOL. Any run (stage
   or practice) feeds a shared daily tally via settleRunMissions();
   missions complete themselves the moment the tally crosses their
   target and grant coins (文) on the spot — no claim step. Completed
   missions are announced by the banner that slides down from the top
   of the screen after the run ends.

   To add a mission:
   1. If it needs a new counter: add it to freshTally(), to the runStats
      shape in resetRunStats() (js/game.js), and to the merge inside
      settleRunMissions().
   2. Add an entry to MISSION_POOL whose metric() reads that counter.
   The coin balance persists forever; missions and tally reroll daily.
   ==================================================================== */
'use strict';

const MISSIONS_KEY = 'samurai-missions';
const MISSIONS_PER_DAY = 3;
const DAILY_BONUS_REWARD = 25;    // once per day for clearing all missions

/* ---- mission pool ----
   `metric(tally)` maps the day's tally to this mission's progress;
   `available()` optionally keeps a mission out of the roll entirely
   (boss missions only make sense once the campaign reaches them). */
const MISSION_POOL = [
  { id: 'moonlit',   category: 'score',    kanji: '月',
    name: 'MOONLIT PATH',    target: 10, reward: 30,
    desc: 'Reach score 10 in a single run',
    metric: (t) => t.bestScore },
  { id: 'petals',    category: 'score',    kanji: '桜',
    name: 'FALLING PETALS',  target: 20, reward: 45,
    desc: 'Reach score 20 in a single run',
    metric: (t) => t.bestScore },
  { id: 'cuts20',    category: 'kills',    kanji: '廿',
    name: 'TWENTY CUTS',     target: 20, reward: 30,
    desc: 'Slay 20 demons today',
    metric: (t) => t.kills },
  { id: 'cuts30',    category: 'kills',    kanji: '卅',
    name: 'THIRTY CUTS',     target: 30, reward: 50,
    desc: 'Slay 30 demons today',
    metric: (t) => t.kills },
  { id: 'screen',    category: 'monster',  kanji: '屏',
    name: 'SCREEN SLASHER',  target: 5,  reward: 30,
    desc: 'Slay 5 skip monsters today',
    metric: (t) => t.skipKills },
  { id: 'mirror',    category: 'monster',  kanji: '鏡',
    name: 'MIRROR BREAKER',  target: 5,  reward: 30,
    desc: 'Slay 5 reverse demons today',
    metric: (t) => t.reverseKills },
  { id: 'oneflash',  category: 'ability',  kanji: '閃',
    name: 'ONE FLASH',       target: 3,  reward: 25,
    desc: 'Unleash your ability 3 times today',
    metric: (t) => t.abilityUses },
  { id: 'chain',     category: 'ability',  kanji: '連',
    name: 'LIGHTNING CHAIN', target: 12, reward: 35,
    desc: 'Slay 12 demons with Issen today',
    metric: (t) => t.issenKills },
  { id: 'quickdraw', category: 'speed',    kanji: '抜',
    name: 'QUICK DRAW',      target: 10, reward: 30,
    desc: 'Land 10 strikes in under 1.0s',
    metric: (t) => t.fastKills },
  { id: 'path',      category: 'campaign', kanji: '道',
    name: 'PATH CLEARER',    target: 1,  reward: 30,
    desc: 'Pass 1 campaign stage today',
    metric: (t) => t.stagesPassed },
  { id: 'boss',      category: 'campaign', kanji: '王',
    name: 'BOSS SLAYER',     target: 1,  reward: 50,
    desc: 'Pass a boss stage today',
    metric: (t) => t.bossPassed,
    available: () => progress.unlockedStage >= 10 },
];

function freshTally() {
  return {
    kills: 0,           // all demons slain (manual + ability)
    skipKills: 0,       // skip monsters slain
    reverseKills: 0,    // reverse demons slain
    abilityUses: 0,     // ability activations
    issenKills: 0,      // demons slain by the ability
    fastKills: 0,       // manual strikes under FAST_KILL_MS
    bestScore: 0,       // best single-run score of the day
    stagesPassed: 0,    // campaign stages passed
    bossPassed: 0,      // boss stages passed
  };
}

const missionsState = {
  dayKey: null,          // 'YYYY-MM-DD' the current missions belong to
  coins: 0,              // wallet — persists across days
  bonusAwarded: false,   // all-missions bonus granted for the day
  missions: [],          // [{id, done}] — progress derives from the tally
  tally: freshTally(),
};

/* ---- persistence (same defensive pattern as loadProgress) ---- */
function loadMissions() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(MISSIONS_KEY));
  } catch (e) { /* missing/corrupt storage → fresh missions */ }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;

  const coins = Number(raw.coins);
  if (Number.isFinite(coins)) missionsState.coins = Math.max(0, Math.floor(coins));
  if (typeof raw.dayKey === 'string' && raw.dayKey) missionsState.dayKey = raw.dayKey;
  if (typeof raw.bonusAwarded === 'boolean') missionsState.bonusAwarded = raw.bonusAwarded;

  if (Array.isArray(raw.missions)) {
    const loaded = [];
    raw.missions.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const def = MISSION_POOL.find((m) => m.id === entry.id);
      if (def) loaded.push({ id: def.id, done: entry.done === true });
    });
    if (loaded.length) missionsState.missions = loaded;
  }

  if (raw.tally && typeof raw.tally === 'object' && !Array.isArray(raw.tally)) {
    const tally = freshTally();
    Object.keys(tally).forEach((key) => {
      const v = Number(raw.tally[key]);
      if (Number.isFinite(v)) tally[key] = Math.max(0, Math.floor(v));
    });
    missionsState.tally = tally;
  }
}

function saveMissions() {
  try {
    localStorage.setItem(MISSIONS_KEY, JSON.stringify({
      dayKey: missionsState.dayKey,
      coins: missionsState.coins,
      bonusAwarded: missionsState.bonusAwarded,
      missions: missionsState.missions,
      tally: missionsState.tally,
    }));
  } catch (e) { /* private mode / quota errors should never break play */ }
}

/* ---- daily roll ---- */
function todayKey() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function pickDailyMissions() {
  const pool = MISSION_POOL.filter((m) => !m.available || m.available());
  for (let i = pool.length - 1; i > 0; i--) {           // Fisher–Yates shuffle
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  // First pass takes at most one mission per category, so a day never
  // rolls e.g. three kill-count missions.
  const picked = [];
  const seen = new Set();
  pool.forEach((m) => {
    if (picked.length < MISSIONS_PER_DAY && !seen.has(m.category)) {
      picked.push(m);
      seen.add(m.category);
    }
  });
  pool.forEach((m) => {                                  // safety fill
    if (picked.length < MISSIONS_PER_DAY && !picked.includes(m)) picked.push(m);
  });
  return picked;
}

function rollDailyMissions() {
  missionsState.dayKey = todayKey();
  missionsState.bonusAwarded = false;
  missionsState.tally = freshTally();
  missionsState.missions = pickDailyMissions().map((m) => ({ id: m.id, done: false }));
}

// Reroll whenever the calendar day has moved on (or the saved day is
// somehow empty). Called at startup, when the menu / missions screens
// are shown, and at settlement.
function ensureToday() {
  if (missionsState.dayKey === todayKey() && missionsState.missions.length) return;
  rollDailyMissions();
  saveMissions();
}

function missionDef(id) {
  return MISSION_POOL.find((m) => m.id === id) || null;
}

/* ---- settlement ----
   Merges the finished run's stats into the day's tally, completes any
   mission whose target is now met, grants coins, and returns what was
   newly completed for the banner (null when nothing was). */
function settleRunMissions() {
  const stats = state.runStats;
  if (!stats || stats.settled) return null;
  stats.settled = true;

  const tally = missionsState.tally;
  tally.kills += stats.kills;
  tally.skipKills += stats.killsByType.skip;
  tally.reverseKills += stats.killsByType.reverse;
  tally.abilityUses += stats.abilityUses;
  tally.issenKills += stats.issenKills;
  tally.fastKills += stats.fastKills;
  tally.stagesPassed += stats.stagesPassed;
  tally.bossPassed += stats.bossPassed;
  tally.bestScore = Math.max(tally.bestScore, stats.kills);   // the run's score

  const completed = [];
  missionsState.missions.forEach((entry) => {
    if (entry.done) return;
    const def = missionDef(entry.id);
    if (def && def.metric(tally) >= def.target) {
      entry.done = true;
      missionsState.coins += def.reward;
      completed.push(def);
    }
  });

  let bonus = false;
  if (!missionsState.bonusAwarded && missionsState.missions.length &&
      missionsState.missions.every((m) => m.done)) {
    missionsState.bonusAwarded = true;
    missionsState.coins += DAILY_BONUS_REWARD;
    bonus = true;
  }

  // A run that straddled midnight counts toward the day it was rolled
  // for; only then does the new day's roll happen.
  if (missionsState.dayKey !== todayKey()) rollDailyMissions();
  saveMissions();

  if (!completed.length && !bonus) return null;
  return { completed, bonus };
}

/* ---- banner ---- */
function showMissionBanner(result) {
  if (!result || (!result.completed.length && !result.bonus)) return;
  if (state.screen === 'game') return;   // never cover an active duel

  const banner = $('#mission-banner');
  $('#banner-title').textContent =
    result.completed.length > 1 ? 'MISSIONS COMPLETE' : 'MISSION COMPLETE';
  let html = result.completed.map((def) => `
    <div class="banner-line">
      <span class="line-name">${def.name}</span>
      <span class="line-reward">+${def.reward} 文</span>
    </div>`).join('');
  if (result.bonus) {
    html += `
    <div class="banner-line bonus">
      <span class="line-name">ALL MISSIONS CLEARED</span>
      <span class="line-reward">+${DAILY_BONUS_REWARD} 文</span>
    </div>`;
  }
  $('#banner-lines').innerHTML = html;

  banner.classList.remove('go');
  void banner.offsetWidth;               // reflow to restart animation
  banner.classList.add('go');
  missionSound();
}

/* ---- missions screen ---- */
let missionTimerId = null;

function msUntilMidnight() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
}

function renderMissionsScreen() {
  ensureToday();
  if (missionTimerId) { clearInterval(missionTimerId); missionTimerId = null; }

  const list = $('#mission-list');
  list.innerHTML = '';
  missionsState.missions.forEach((entry) => {
    const def = missionDef(entry.id);
    if (!def) return;
    const value = Math.min(def.target, def.metric(missionsState.tally));
    const frac = Math.max(0, Math.min(1, value / def.target));
    const card = document.createElement('div');
    card.className = 'mission-card' + (entry.done ? ' done' : '');
    card.innerHTML = `
      <span class="mission-kanji">${def.kanji}</span>
      <div class="mission-info">
        <span class="mission-name">${def.name}</span>
        <span class="mission-desc">${def.desc}</span>
        <div class="mission-bar"><div class="mission-fill" style="transform:scaleX(${frac})"></div></div>
      </div>
      <div class="mission-side">
        <span class="mission-progress">${entry.done ? '済' : value + '/' + def.target}</span>
        <span class="mission-reward">+${def.reward} 文</span>
      </div>`;
    list.appendChild(card);
  });

  $('#mission-coins').textContent = missionsState.coins;
  $('#mission-bonus').classList.toggle('hidden', !missionsState.bonusAwarded);

  // Refresh the "new missions in…" countdown while the screen is open.
  const resetEl = $('#mission-reset');
  const tick = () => {
    if (state.screen !== 'missions') {
      clearInterval(missionTimerId);
      missionTimerId = null;
      return;
    }
    const mins = Math.max(0, Math.ceil(msUntilMidnight() / 60000));
    resetEl.textContent =
      `NEW MISSIONS IN ${Math.floor(mins / 60)}H ${String(mins % 60).padStart(2, '0')}M`;
  };
  tick();
  missionTimerId = setInterval(tick, 15000);
}

/* ---- menu coin chip + missions badge ---- */
function updateMenuMissions() {
  ensureToday();
  const total = missionsState.missions.length;
  const done = total ? missionsState.missions.filter((m) => m.done).length : 0;
  $('#missions-badge').textContent = total ? done + '/' + total : '';
  $('#menu-coins').textContent = missionsState.coins;
}
