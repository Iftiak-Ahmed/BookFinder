/**
 * Synthesized alarm beep — no audio asset needed. Browsers block AudioContext
 * until a user gesture, so primeAudio() must run inside a click handler
 * (the login button) well before the first real alert needs to sound.
 */
let ctx = null;
let intervalId = null;

export function primeAudio() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    // Web Audio unavailable — the alarm silently no-ops.
  }
}

function beep() {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = 880;
  gain.gain.value = 0.16;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.18);
}

export function startAlarm() {
  if (intervalId) return;
  primeAudio();
  if (!ctx) return;
  beep();
  intervalId = setInterval(beep, 700);
}

export function stopAlarm() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
}
