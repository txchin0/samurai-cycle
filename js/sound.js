/* ====================================================================
   SAMURAI CYCLE — sound
   Tiny synthesized WebAudio blips, no audio assets.
   ==================================================================== */
'use strict';

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
function issenSound() {
  beep(523.25, 0.08, 'square', 0.12);           // C5
  beep(784.0, 0.1, 'square', 0.12);             // G5
  beep(156.0, 0.18, 'sawtooth', 0.1);           // low whoosh
}
function failSound() {
  beep(90, 0.35, 'sawtooth', 0.22);
}
