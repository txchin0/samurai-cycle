# 侍 Samurai Cycle

A black‑and‑white, sumi‑e / cartoon music‑reaction game set in feudal Japan.
You are a lone samurai on a moonlit forest path, seen from behind. Letter‑demons
(squares with legs, arms and angry eyes) come down the path toward you — slash
each one by playing the **next note in the cycle** before your window runs out
(except when a special demon changes the rule, below).

![style: black & white cartoon Japan](https://img.shields.io/badge/style-sumi--e%20cartoon-black)

## How to play

1. A demon appears carrying a letter (A–G) after a short random delay.
2. Press the key for the **next letter in the chosen cycle** to slash it:
   - **Cycle of fourths:** `B → E → A → D → G → C → F → (B)`
   - **Cycle of fifths:** `B → F → C → G → D → A → E → (B)`
   During play the full cycle is shown as your hint (e.g. `B → E → A → D → G → C → F`),
   so you can work out every next note from the letters on the demons.
3. Each demon carries a random letter, so every duel is a fresh test. Keep
   the streak going.
4. Sometimes (~10% of spawns) a demon hides behind a folding screen (屏風)
   with a **decoy** letter on it. It's a **skip monster**: to slay it you
   must strike the note **two steps ahead** in the cycle (e.g. a screen
   showing `B` is slain by `A` on fourths). Strike the *next* note instead
   and you'll just cut the cover off — no score, and the timer keeps
   running — revealing the true demon, which now shows the note one cycle
   away and must still be slain with the two-ahead note. After the reveal,
   that demon follows the normal rules. Skip monsters buy you time: a lone
   skip doubles the reaction window (2×), and in Advanced waves the
   window grows by each skip monster's weighted share (e.g. 3 monsters, 1
   skip → ×1⅓).
5. Sometimes (~10% of spawns) an ink‑bodied **mirror demon** (鏡鬼) appears
   with a small `«` badge. It's a **reverse monster**: strike the note
   **one step back** in the cycle (e.g. a mirror showing `E` on fourths
   is slain by `B`). The letter stays upright; only the direction changes.
   Reverse monsters buy you a little time: a lone reverse stretches the
   reaction window to 2×, and Advanced waves grow by its weighted share.
6. Miss the timing window, or hit the wrong note, and you fall.
7. Your **ability** starts each run charged (blade button, bottom‑left).
   Press `Space` (or tap the button) during a wave to unleash **Issen** (一閃):
   one flash slays every remaining demon and scores each kill. The ring
   around the button shows the charge — it refills after 10 manual strikes.

The demon's letter is randomized on every spawn and never repeats twice in a
row; the cycle only tells you the order to work from — special demons apply
it in the other direction.

## Menus

- **STAGES** — a 50-stage campaign in five teaching blocks:
  **BASICS → SKIP → WAVES → REVERSE → COMBINED**. Every 10th stage is a
  boss stage. Stages are endless score runs: score **10** on a normal stage
  (or **20** on a boss) to unlock the next. Stage 1 starts at a relaxed
  3-second window with a single normal demon; later blocks introduce skip
  demons, multi-monster waves, reverse demons, and finally a 5-monster,
  near-tightest window with a heavy special mix. Past 10 kills on normal
  stages (20 on boss stages), each additional kill compounds a **1.5%
  reduction** to the stage's base timer.
- **PRACTICE** — the original normal/advanced/custom difficulty screen, for
  tuning your own runs without touching campaign progress.
  - **Normal** — Novice 2.0 s, Ronin 1.2 s, Master 0.7 s, plus Custom
    reaction window, spawn pace, and monster mix.
  - **Advanced** — 2–5 monsters per wave with a whole-wave window, spawn
    pace, and monster mix; strike monsters bottom-to-top (nearest first).
  - In Advanced, waves containing special monsters (skip or reverse) get
    extra time — the wave window is multiplied by
    `1 + Σ(modifier / count)`, so each skip adds its share of the 100% bonus
    and each reverse adds its share of the 100% bonus (a lone special monster
    doubles the window).
- **Options**
  - Cycle direction: **Fourths** or **Fifths**
  - On-screen guides: **Show** or **Hide** — hiding removes the timer bar, the
    strike hint and the HUD for a purer duel (the demon still shows its letter,
    since that's the note you must react to)
  - Sound: on / off
  - Touch keys: **Auto**, **Show**, or **Hide** — Auto shows the on-screen note
    buttons on touch-first devices (primary input is touch), even if a mouse or
    stylus is also connected

Your campaign progress (unlocked stage and per-stage bests) and practice
scores are saved in the browser (`localStorage`).

## Run it

It's plain HTML/CSS/JS — no build step. Either:

```bash
# open directly
start index.html      # Windows
```

or serve the folder (recommended, so audio + fonts load cleanly):

```bash
python -m http.server 8731
```

then visit <http://localhost:8731>.

## Controls

| Key | Action |
| --- | --- |
| `A`–`G` | Strike that note |
| On-screen note buttons | Strike with touch — auto-shown on touch-first phones/tablets, or set via Options → Touch keys |
| `Space` / ability button | Unleash the ability when its ring is full (Issen: slay all remaining demons) |
| `Esc` | Quit to menu (during a run) |

## Mobile / touch

- The game switches to a dedicated portrait layout on phones and fills the
  browser viewport edge-to-edge (a 620-wide design whose height stretches to
  match the screen), and keeps the existing landscape layout on wider screens.
- On touch-first devices, a 7-button note pad appears as a bar along the
  bottom of the screen spanning its full width: two rows in portrait, one
  row in landscape.
- If you use a hybrid device (touch laptop, phone with a mouse) and the default
  doesn't match how you play, override the detection with **Options → Touch keys**.

## Files

- `index.html` — screens & markup (menu, difficulty, options, game, game‑over)
- `style.css` — the sumi‑e / cartoon theme (paper texture, ink buttons, demons)
- `sumie_forest.webp`, `sumie_forest_landscape.webp` — the portrait and
  landscape gameplay backdrop images (the right one is picked for the window)
- `js/config.js` — cycles, difficulty tables, the 50-stage progression,
  spawn pacing, and persisted options/progress
- `js/abilities.js` — the active-ability registry (Issen's effect, icon and
  recharge cost; new abilities plug in here)
- `js/sound.js` — WebAudio blips (synthesized, no assets)
- `js/game.js` — core state machine, cycle logic, timing, input, game over
- `js/monsters.js` — monster spawning, types & rendering (the skip monster,
  reverse monster, and future types live here)
- `js/ui.js` — screens, menus, options, touch keys, fit-to-viewport, init

The files load in order: `config.js → sound.js → game.js → monsters.js → ui.js`.
Monster spawn rates are configurable in `js/config.js` (`skipMonsterChance`,
`reverseMonsterChance`, plus the `custom*Chance` and `advanced*Chance`
settings used by Custom mode).

## Notes

- The game is authored at a 960×620 landscape design size and a 620-wide
  portrait design size (portrait height stretches to fill the screen), then
  uniformly scaled to fit the viewport (`fitToViewport` in `js/ui.js`), so it
  fills everything from phones to 4K displays and re-fits live on resize.
  The UI art is vector/SVG so it stays crisp at any scale, while the forest
  backdrop switches between the portrait and landscape webp images based on
  the window shape and is zoomed to cover the play area.
- The reaction deadline is driven by a `setTimeout`, not `requestAnimationFrame`,
  so backgrounding the tab can't freeze the timer to gain free time. The
  animated bar is purely visual.
- Sound uses the WebAudio API (tiny synthesized note blips) — no asset files.
