// COREWARD — sound, synthesized in code with the Web Audio API. There are no
// audio files: every effect is an oscillator or a burst of filtered noise,
// shaped by hand. The world reports what happened as event names ('shoot',
// 'boom', 'nova', ...) and main.js passes them here; this file turns them
// into the game's voice — a bright little blaster, soft round explosions, a
// chime for pickups, a rising figure for each new wave.
//
// Browsers will not let a page make sound before the visitor interacts, so
// nothing is created until unlock() is called from the first click or key.

const EVENT_COOLDOWNS = { shoot: 0.05, boom: 0.04 };

/** Creates the sound engine. Safe to call play() before unlock(): it stays silent. */
export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;
  const lastPlayed = new Map();

  function unlock() {
    if (!context) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      context = new AudioCtor();
      master = context.createGain();
      master.gain.value = 0.16;
      master.connect(context.destination);
      const length = context.sampleRate * 0.5;
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    if (context.state === 'suspended') void context.resume();
  }

  function tone({ from, to = from, type = 'square', seconds = 0.1, volume = 0.5, delay = 0 }) {
    if (!context || !master) return;
    const start = context.currentTime + delay;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + seconds);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
  }

  function noise({ seconds = 0.3, volume = 0.6, cutoff = 900, delay = 0 }) {
    if (!context || !master || !noiseBuffer) return;
    const start = context.currentTime + delay;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, start);
    filter.frequency.exponentialRampToValueAtTime(90, start + seconds);
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    source.connect(filter).connect(gain).connect(master);
    source.start(start);
    source.stop(start + seconds + 0.02);
  }

  const VOICES = {
    shoot() {
      tone({ from: 880 + Math.random() * 160, to: 240, type: 'square', seconds: 0.09, volume: 0.16 });
    },
    boom() {
      noise({ seconds: 0.28, volume: 0.5, cutoff: 1100 });
      tone({ from: 160, to: 48, type: 'triangle', seconds: 0.25, volume: 0.4 });
    },
    hit() {
      noise({ seconds: 0.2, volume: 0.55, cutoff: 700 });
      tone({ from: 220, to: 60, type: 'sawtooth', seconds: 0.2, volume: 0.3 });
    },
    corehit() {
      tone({ from: 196, to: 98, type: 'sine', seconds: 0.3, volume: 0.65 });
      noise({ seconds: 0.18, volume: 0.3, cutoff: 500 });
    },
    pickup() {
      tone({ from: 660, type: 'sine', seconds: 0.09, volume: 0.4 });
      tone({ from: 990, type: 'sine', seconds: 0.14, volume: 0.4, delay: 0.07 });
    },
    nova() {
      noise({ seconds: 0.55, volume: 0.7, cutoff: 2600 });
      tone({ from: 180, to: 720, type: 'sawtooth', seconds: 0.4, volume: 0.22 });
    },
    wave() {
      tone({ from: 392, type: 'triangle', seconds: 0.12, volume: 0.35 });
      tone({ from: 523, type: 'triangle', seconds: 0.12, volume: 0.35, delay: 0.09 });
      tone({ from: 784, type: 'triangle', seconds: 0.2, volume: 0.35, delay: 0.18 });
    },
    over() {
      tone({ from: 392, to: 196, type: 'triangle', seconds: 0.5, volume: 0.45 });
      tone({ from: 311, to: 155, type: 'triangle', seconds: 0.6, volume: 0.4, delay: 0.3 });
      tone({ from: 233, to: 110, type: 'triangle', seconds: 0.9, volume: 0.4, delay: 0.65 });
    },
    win() {
      const notes = [523, 659, 784, 1046];
      notes.forEach((freq, i) => tone({ from: freq, type: 'triangle', seconds: 0.22, volume: 0.38, delay: i * 0.11 }));
    },
  };

  /** Plays the voice for a world event, throttling the chatteriest ones. */
  function play(event) {
    if (!context) return;
    const voice = VOICES[event];
    if (!voice) return;
    const cooldown = EVENT_COOLDOWNS[event] ?? 0;
    const now = performance.now() / 1000;
    if (cooldown > 0 && now - (lastPlayed.get(event) ?? -Infinity) < cooldown) return;
    lastPlayed.set(event, now);
    voice();
  }

  return { unlock, play };
}
