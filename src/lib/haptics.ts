export type HapticPattern = 'tap' | 'success' | 'error' | 'turn' | 'victory';

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 10,
  success: [15, 30, 15],
  error: [40, 30, 40],
  turn: 20,
  victory: [20, 40, 20, 40, 60],
};

export function vibrate(pattern: HapticPattern): void {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  navigator.vibrate(PATTERNS[pattern]);
}
