/* ====================================================================
   SAMURAI CYCLE — UI / screens
   Screen switching, difficulty tabs + swipe, options wiring (sliders,
   toggles), touch-key detection, fit-to-viewport scaling, and the init
   block. Loaded last: it wires DOM listeners and runs startup.
   ==================================================================== */
'use strict';

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

/* ====================================================================
   FIT-TO-VIEWPORT SCALING
   The paper is authored at a fixed design size and scaled to fill
   whatever screen it runs on — tiny laptops up to 4K displays.
   ==================================================================== */
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

/* ====================================================================
   TOUCH KEYS
   No browser can reliably detect a physical keyboard, so AUTO uses
   pointer heuristics: any coarse pointer and no fine pointer means
   a phone/tablet without a keyboard or mouse. SHOW/HIDE override.
   ==================================================================== */
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
