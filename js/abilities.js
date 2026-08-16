/* ====================================================================
   SAMURAI CYCLE — active abilities
   A single ability is equipped per run (`state.abilityId`). It starts
   charged and refills by landing manual kills with the note keys; the
   button ring shows the charge and Space / the button triggers it.

   To add a new ability:
   1. Add an entry to ABILITIES with `id`, `name`, `desc`, `killsRequired`,
      an `icon` SVG (drawn inside the button), and an `activate()` effect.
   2. Point `state.abilityId` at the new id (js/game.js).
   Everything else — charge ring, ready/grayed states, Space input, touch
   pad slot, bottom-left button — is generic and needs no changes.

   Effects may call the shared game helpers defined in js/game.js:
   strikeEffects(), strikeSlain(el), registerKill(), completeWave(),
   popup(text), plus sound helpers from js/sound.js.
   ==================================================================== */
'use strict';

const ABILITIES = {
  issen: {
    id: 'issen',
    name: 'Issen',
    kanji: '一閃',
    desc: 'Slay all remaining demons in the wave',
    killsRequired: 10,          // manual kills needed to recharge after use
    icon: `
      <svg class="ability-icon" viewBox="0 0 100 100" aria-hidden="true">
        <line x1="34" y1="54" x2="82" y2="48" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>
        <path d="M82 48 L67 43 L67 53 Z" fill="currentColor"/>
        <line x1="32" y1="38" x2="29" y2="66" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
        <line x1="30" y1="54" x2="14" y2="58" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
      </svg>`,

    canActivate() {
      return state.playing && state.awaiting && state.monsters.length > 0;
    },

    // One flash: slay every remaining demon in the wave at once.
    activate() {
      strikeEffects();
      issenSound();
      popup('一閃！');
      state.monsters.forEach((monster) => {
        if (monster.el && !monster.el.classList.contains('slain')) {
          strikeSlain(monster.el);
          registerKill();
        }
      });
      completeWave();
    },
  },
};
