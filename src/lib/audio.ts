// Tiny synthesized sound effects via Web Audio — no asset files needed, which
// keeps the PWA offline-cacheable and the bundle small.

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  if (!ctx) ctx = new AudioCtor();
  return ctx;
}

function tone(freq: number, durationMs: number, type: OscillatorType = 'sine', gain = 0.05, delayMs = 0) {
  const audioCtx = getContext();
  if (!audioCtx) return;
  const start = audioCtx.currentTime + delayMs / 1000;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gainNode.gain.value = gain;
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  osc.start(start);
  osc.stop(start + durationMs / 1000);
}

export type SfxName =
  | 'reveal'
  | 'flagCorrect'
  | 'flagIncorrect'
  | 'mine'
  | 'cascade'
  | 'turnChange'
  | 'lifeLost'
  | 'lifeGained'
  | 'reward'
  | 'streak'
  | 'victory'
  | 'elimination';

export function playSfx(name: SfxName): void {
  switch (name) {
    case 'reveal':
      tone(520, 60, 'sine', 0.04);
      break;
    case 'flagCorrect':
      tone(660, 90, 'triangle', 0.06);
      tone(880, 90, 'triangle', 0.05, 60);
      break;
    case 'flagIncorrect':
      tone(220, 140, 'sawtooth', 0.06);
      break;
    case 'mine':
      tone(140, 220, 'sawtooth', 0.09);
      tone(90, 260, 'square', 0.06, 80);
      break;
    case 'cascade':
      tone(700, 40, 'sine', 0.03);
      tone(820, 40, 'sine', 0.03, 40);
      tone(940, 50, 'sine', 0.03, 80);
      break;
    case 'turnChange':
      tone(440, 80, 'sine', 0.05);
      break;
    case 'lifeLost':
      tone(300, 180, 'square', 0.06);
      break;
    case 'lifeGained':
      tone(760, 90, 'triangle', 0.06);
      tone(980, 120, 'triangle', 0.05, 90);
      break;
    case 'reward':
      tone(600, 80, 'triangle', 0.05);
      tone(900, 80, 'triangle', 0.05, 70);
      tone(1200, 110, 'triangle', 0.05, 140);
      break;
    case 'streak':
      tone(880, 70, 'triangle', 0.05);
      tone(1046, 90, 'triangle', 0.05, 60);
      break;
    case 'victory':
      tone(523, 120, 'triangle', 0.06);
      tone(659, 120, 'triangle', 0.06, 100);
      tone(784, 180, 'triangle', 0.06, 200);
      break;
    case 'elimination':
      tone(200, 260, 'sawtooth', 0.07);
      break;
  }
}
