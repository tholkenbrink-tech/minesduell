import { beforeEach, describe, expect, it } from 'vitest';
import { useMatchStore } from '../useMatchStore';
import type { DuelState } from '../../engine/duel';
import { PLAYER_SHAPES, PLAYER_THEMES, type Player } from '../../engine/types';
import type { DeviceArrangement } from '../../engine/arrangement';

function makePlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i + 1}`,
    theme: PLAYER_THEMES[i % PLAYER_THEMES.length],
    shape: PLAYER_SHAPES[i % PLAYER_SHAPES.length],
  }));
}

/** Start a fresh duel with the given arrangement and player count. */
function startDuel(arrangement: DeviceArrangement, playerCount: number) {
  const s = useMatchStore.getState();
  s.selectMode('duel'); // resets settings to defaults
  s.setPlayers(makePlayers(playerCount));
  s.updateSettings({ arrangement, board: { width: 8, height: 8, mines: 5, preset: 'custom' } });
  s.startGame();
}

const duel = () => useMatchStore.getState().match as DuelState;

beforeEach(() => {
  localStorage.clear();
});

describe('arrangement switching mid-match', () => {
  it('assigns seats from the selected arrangement when the game starts', () => {
    startDuel('face-to-face', 2);
    expect(useMatchStore.getState().seats.map((s) => s.position)).toEqual(['bottom', 'top']);

    startDuel('table', 4);
    expect(useMatchStore.getState().seats.map((s) => s.position)).toEqual(['bottom', 'left', 'top', 'right']);
  });

  it('preserves every gameplay value when switching arrangement while paused', () => {
    startDuel('face-to-face', 2);
    // Produce real in-game state: a revealed region and a partially-elapsed timer.
    useMatchStore.getState().reveal({ x: 0, y: 0 });
    useMatchStore.getState().setPaused(true);
    useMatchStore.getState().syncTimer('0-1', 12);

    const matchBefore = useMatchStore.getState().match;
    const serializedBefore = JSON.stringify(matchBefore);
    const activeBefore = duel().activePlayerIndex;
    const actionsBefore = duel().turnActionsCount;

    useMatchStore.getState().setArrangement('side-by-side');
    const after = useMatchStore.getState();

    // The match object is left completely untouched (same reference + bytes).
    expect(after.match).toBe(matchBefore);
    expect(JSON.stringify(after.match)).toBe(serializedBefore);
    // ...and specifically: no turn advance, no active-player change.
    expect(duel().activePlayerIndex).toBe(activeBefore);
    expect(duel().turnActionsCount).toBe(actionsBefore);
    // Presentation did change.
    expect(after.settings.arrangement).toBe('side-by-side');
    expect(after.seats).toHaveLength(2);
  });

  it('does not resume or reset the timer', () => {
    startDuel('face-to-face', 2);
    useMatchStore.getState().setPaused(true);
    useMatchStore.getState().syncTimer('0-1', 9);

    useMatchStore.getState().setArrangement('table');
    const after = useMatchStore.getState();

    expect(after.paused).toBe(true); // still paused — never auto-resumed
    expect(after.timerState).toEqual({ resetKey: '0-1', remaining: 9 }); // value untouched
  });

  it('recomputes seats for the new arrangement (Table-with-2 uses Face-to-Face seating)', () => {
    startDuel('face-to-face', 2);
    useMatchStore.getState().setPaused(true);

    useMatchStore.getState().setArrangement('table');
    expect(useMatchStore.getState().seats.map((s) => s.position)).toEqual(['bottom', 'top']);
  });

  it('accepts explicit seats (e.g. swapped sides) without touching the match', () => {
    startDuel('face-to-face', 2);
    useMatchStore.getState().reveal({ x: 0, y: 0 });
    useMatchStore.getState().setPaused(true);
    const matchBefore = useMatchStore.getState().match;

    const seats = useMatchStore.getState().seats;
    const swapped = seats.map((s) => ({
      ...s,
      position: (s.position === 'bottom' ? 'top' : 'bottom') as 'bottom' | 'top',
      rotation: (s.position === 'bottom' ? 180 : 0) as 0 | 180,
    }));
    useMatchStore.getState().setArrangement('face-to-face', swapped);

    const after = useMatchStore.getState();
    expect(after.match).toBe(matchBefore);
    // Player 0 now sits at the top; turn order (playerId ↔ turnOrder) is unchanged.
    const p0 = after.seats.find((s) => s.playerId === 'p0');
    expect(p0?.position).toBe('top');
    expect(p0?.turnOrder).toBe(0);
  });
});
