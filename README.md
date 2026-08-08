# 侍 Samurai Cycle

A black‑and‑white, sumi‑e / cartoon music‑reaction game set in feudal Japan.
You are a lone samurai on a moonlit forest path, seen from behind. Letter‑demons
(squares with legs, arms and angry eyes) come down the path toward you — slash
each one by playing the **next note in the cycle** before your window runs out.

![style: black & white cartoon Japan](https://img.shields.io/badge/style-sumi--e%20cartoon-black)

## How to play

1. A demon appears carrying a letter (A–G) after a short random delay.
2. Press the key for the **next letter in the chosen cycle** to slash it:
   - **Cycle of fourths:** `B → E → A → D → G → C → F → (B)`
   - **Cycle of fifths:** `B → F → C → G → D → A → E → (B)`
3. Each correct strike chains into the next note. Keep the cycle going.
4. Miss the timing window, or hit the wrong note, and you fall.

The letter you just played becomes the next demon's letter, so a good run
literally walks the whole circle of fifths/fourths, over and over.

## Menus

- **Start → Difficulty**
  - **Novice** — 2.0 s reaction window
  - **Ronin** — 1.2 s
  - **Master** — 0.7 s
  - **Custom** — set your own window (0.3–3.0 s)
- **Options**
  - Cycle direction: **Fourths** or **Fifths**
  - On-screen guides: **Show** or **Hide** — hiding removes the timer bar, the
    strike hint and the HUD for a purer duel (the demon still shows its letter,
    since that's the note you must react to)
  - Sound: on / off
  - Touch keys: **Auto**, **Show**, or **Hide** — Auto shows the on-screen note
    buttons on touch screens without a keyboard or mouse

Your best score is saved in the browser (`localStorage`).

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
| On-screen note buttons | Strike with touch — auto-shown on phones/tablets, or set via Options → Touch keys |
| `Esc` | Quit to menu (during a run) |

## Mobile / touch

- The game switches to a dedicated portrait layout on phones and fills the
  browser viewport edge-to-edge (a 620-wide design whose height stretches to
  match the screen), and keeps the existing landscape layout on wider screens.
- On touch devices without a keyboard, a 7-button note pad appears as a bar
  along the bottom of the screen spanning its full width: two rows in
  portrait, one row in landscape.
- If you use a phone with a Bluetooth keyboard (or a touch laptop where you'd
  rather tap), override the detection with **Options → Touch keys**.

## Files

- `index.html` — screens & markup (menu, difficulty, options, game, game‑over)
- `style.css` — the sumi‑e / cartoon theme (paper texture, ink buttons, demons)
- `game.js` — state machine, cycle logic, timing, WebAudio blips

## Notes

- The game is authored at a 960×620 landscape design size and a 620-wide
  portrait design size (portrait height stretches to fill the screen), then
  uniformly scaled to fit the viewport (`fitToViewport` in `game.js`), so it
  fills everything from phones to 4K displays and re-fits live on resize.
  Because the art is all vector/SVG, it stays crisp at any scale.
- The reaction deadline is driven by a `setTimeout`, not `requestAnimationFrame`,
  so backgrounding the tab can't freeze the timer to gain free time. The
  animated bar is purely visual.
- Sound uses the WebAudio API (tiny synthesized note blips) — no asset files.
