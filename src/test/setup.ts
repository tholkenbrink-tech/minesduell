import '@testing-library/jest-dom/vitest';

if (!('vibrate' in navigator)) {
  Object.defineProperty(navigator, 'vibrate', { value: () => true, configurable: true });
}

class MockAudioContext {
  createOscillator() {
    return { connect: () => {}, start: () => {}, stop: () => {}, frequency: { value: 0 } };
  }
  createGain() {
    return { connect: () => {}, gain: { value: 0, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} } };
  }
  get currentTime() {
    return 0;
  }
  get destination() {
    return {};
  }
  close() {}
}

window.AudioContext = window.AudioContext || (MockAudioContext as unknown as typeof AudioContext);
