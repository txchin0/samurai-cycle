/* ====================================================================
   SAMURAI CYCLE — monsters
   Spawning, monster-type selection, and DOM construction for the
   letter-demons. New monster types are added here: pickMonsterType
   decides which kind appears, createMonsterData builds its data, and
   createDemon renders it.
   ==================================================================== */
'use strict';

const COVER_REVEAL_MS = 480;  // how long the cover-split reveal lasts

/* ---- monster types ---- */
// First of (hopefully) several monster kinds. Each new type gets its own
// roll here; the skip monster's chance lives in settings.skipMonsterChance
// and the reverse monster's in settings.reverseMonsterChance (both 0–1
// fractions, persisted in the options).
function currentMonsterChances() {
  if (!state.custom) {
    return {
      skip: settings.skipMonsterChance,
      reverse: settings.reverseMonsterChance,
    };
  }
  if (state.mode === 'advanced') {
    return {
      skip: settings.advancedSkipChance,
      reverse: settings.advancedReverseChance,
    };
  }
  return {
    skip: settings.customSkipChance,
    reverse: settings.customReverseChance,
  };
}

function pickMonsterType() {
  const { skip, reverse } = currentMonsterChances();
  const roll = Math.random();
  if (roll < skip) return 'skip';
  if (roll < skip + reverse) return 'reverse';
  return 'normal';
}

// A skip monster shows a decoy letter on its cover: striking the NEXT note
// cuts the cover off (no score), and only the note TWO steps ahead slays it.
// Its timeModifier stretches the reaction window (see waveTimeMultiplier).
function createMonsterData(note) {
  const type = pickMonsterType();
  if (type === 'skip') {
    return {
      type,
      note,                                 // decoy letter on the cover
      revealKey: nextLetter(note),          // cut the cover off
      answer: nextLetter(nextLetter(note)), // the note that slays it
      timeModifier: SKIP_TIME_MODIFIER,     // extra window as a fraction
      revealed: false,
      el: null,
    };
  }
  // A reverse (mirror) demon shows its letter upright, but must be slain
  // with the PREVIOUS note in the cycle. It is a single-hit monster with
  // no reveal stage.
  if (type === 'reverse') {
    return {
      type,
      note,
      answer: prevLetter(note),
      timeModifier: REVERSE_TIME_MODIFIER,
      el: null,
    };
  }
  return { type, note, answer: nextLetter(note), timeModifier: 0, el: null };
}

function spawnDemon() {
  if (!state.playing) return;

  // Each demon carries a random letter (never the same one twice in a row);
  // normally strike the NEXT note in the cycle, but special types override it.
  const cycle = CYCLES[settings.cycle];
  const options = cycle.filter((note) => note !== state.current);
  const note = options[Math.floor(Math.random() * options.length)];
  state.current = note;
  state.monsters = [createMonsterData(note)];
  state.targetIndex = 0;
  state.awaiting = true;

  const demon = createDemon(state.monsters[0], 0);
  $('#enemy-zone').appendChild(demon);
  state.monsters[0].el = demon;
  showPrompt();
  startWaveTimer();
}

function spawnWave(count) {
  if (!state.playing) return;

  const notes = pickDistinctNotes(CYCLES[settings.cycle], count, state.current);
  state.monsters = notes.map((note) => createMonsterData(note));
  state.current = notes[notes.length - 1];
  state.targetIndex = 0;
  state.awaiting = true;

  const zone = $('#enemy-zone');
  state.monsters.forEach((monster, depth) => {
    const demon = createDemon(monster, depth);
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

/* ---- rendering ---- */
function createDemon(monster, depth) {
  const demon = document.createElement('div');
  const typeClass = monster.type === 'skip'
    ? ' skip'
    : monster.type === 'reverse'
      ? ' reverse'
      : '';
  demon.className = 'demon enter depth-' + depth + typeClass;
  // appear on the path, roughly centred ahead of the samurai
  const x = 50 + (Math.random() * 16 - 8);      // 42%–58%
  demon.style.left = x + '%';

  // A skip monster hides behind a folding screen (屏風) whose letter is a
  // decoy; the body underneath carries the demon's TRUE letter (the note one
  // cycle away), revealed when the cover is cut off.
  const trueNote = monster.type === 'skip' ? nextLetter(monster.note) : monster.note;
  const cover = monster.type === 'skip'
    ? `<span class="cover">
         <span class="cover-half left"><span class="cover-letter">${monster.note}</span><span class="cover-rope"></span></span>
         <span class="cover-half right"><span class="cover-letter">${monster.note}</span></span>
         <span class="cover-cut"></span>
       </span>`
    : '';

  demon.innerHTML = `
    <div class="demon-visual">
      <span class="arm l"></span><span class="arm r"></span>
      <span class="leg l"></span><span class="leg r"></span>
      <div class="body">${trueNote}
        <span class="eye l"></span><span class="eye r"></span>
      </div>
      ${monster.type === 'reverse' ? '<span class="reverse-mark">«</span>' : ''}
      <span class="cut"></span>
      ${cover}
    </div>`;
  return demon;
}

/* ---- reveal ---- */
// Striking the next note (not the skip note) slices the cover off: no
// score, the timer keeps running, and the true demon is exposed.
function revealCover(monster) {
  strikeEffects();
  slashSound(monster.revealKey);
  popup('見破った！');
  monster.revealed = true;

  const demon = monster.el;
  demon.classList.remove('enter');
  demon.classList.add('revealed', 'revealing');
  setTimeout(() => {
    const cover = demon.querySelector('.cover');
    if (cover) cover.remove();
    demon.classList.remove('revealing');
  }, COVER_REVEAL_MS);
}
