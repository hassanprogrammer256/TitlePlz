// Web Audio CS-80 / Vangelis harmonic drone synthesizer simulation
let audioCtx: AudioContext | null = null;
let osc1: OscillatorNode | null = null;
let osc2: OscillatorNode | null = null;
let filter: BiquadFilterNode | null = null;
let gainNode: GainNode | null = null;

export function playDroneSynth(isPlaying: boolean, _onEnded?: () => void) {
  try {
    if (!isPlaying) {
      if (gainNode && audioCtx) {
        gainNode.gain.setTargetAtTime(0, audioCtx.currentTime, 0.2);
        setTimeout(() => {
          try {
            osc1?.stop();
            osc2?.stop();
            osc1?.disconnect();
            osc2?.disconnect();
            osc1 = null;
            osc2 = null;
          } catch (e) {
            // ignore
          }
        }, 300);
      }
      return;
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;

    osc1 = audioCtx.createOscillator();
    osc2 = audioCtx.createOscillator();
    filter = audioCtx.createBiquadFilter();
    gainNode = audioCtx.createGain();

    // Vangelis CS-80 Brass / Drone: Sawtooth waves slightly detuned (C# minor / atmospheric)
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(69.3, now); // C#2 fundamental

    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(69.8, now); // slight chorus detune

    // Lowpass filter with slow swell
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(280, now);
    filter.frequency.exponentialRampToValueAtTime(1400, now + 4);
    filter.frequency.exponentialRampToValueAtTime(420, now + 12);
    filter.Q.setValueAtTime(4.2, now);

    // Smooth envelope
    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.linearRampToValueAtTime(0.18, now + 1.2);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc1.start(now);
    osc2.start(now);
  } catch (err) {
    console.warn('Web Audio drone playback note:', err);
  }
}
