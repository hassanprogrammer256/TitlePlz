// Minimal alert chime — synthesized via Web Audio, no external sound files.
// The site is intentionally silent otherwise; this is reserved for
// notifications the user should actually notice (e.g. scout activity).

let audioCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function tone(ctx: AudioContext, freq: number, delay: number, duration = 0.09, peak = 0.24) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const start = ctx.currentTime + delay;

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, start);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(start);
  osc.stop(start + duration + 0.02);
}

// Unlock the AudioContext on the first user gesture (browsers block audio before one).
let unlocked = false;
function unlockOnFirstGesture() {
  if (unlocked) return;
  unlocked = true;
  getContext();
  window.removeEventListener('pointerdown', unlockOnFirstGesture);
  window.removeEventListener('keydown', unlockOnFirstGesture);
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlockOnFirstGesture, { once: true });
  window.addEventListener('keydown', unlockOnFirstGesture, { once: true });
}

export const soundEngine = {
  playAlert() {
    const ctx = getContext();
    if (!ctx) return;
    tone(ctx, 880, 0);
    tone(ctx, 660, 0.12);
  },
};
