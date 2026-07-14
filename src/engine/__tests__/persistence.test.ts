import { beforeEach, describe, expect, it } from 'vitest';
import { readJSON, writeJSON, removeKey } from '../persistence';

describe('persistence', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips plain JSON values', () => {
    writeJSON('prefs', { sound: true, tileSize: 'large' });
    expect(readJSON('prefs', null)).toEqual({ sound: true, tileSize: 'large' });
  });

  it('returns the fallback when nothing is stored', () => {
    expect(readJSON('missing-key', { a: 1 })).toEqual({ a: 1 });
  });

  it('round-trips Set values (e.g. scoredMinePositions)', () => {
    writeJSON('with-set', { scored: new Set(['1,1', '2,2']) });
    const restored = readJSON<{ scored: Set<string> }>('with-set', { scored: new Set() });
    expect(restored.scored).toBeInstanceOf(Set);
    expect(restored.scored.has('1,1')).toBe(true);
    expect(restored.scored.has('2,2')).toBe(true);
  });

  it('removeKey clears a stored value', () => {
    writeJSON('temp', { a: 1 });
    removeKey('temp');
    expect(readJSON('temp', null)).toBeNull();
  });

  it('falls back gracefully on corrupted JSON', () => {
    localStorage.setItem('minesduell:v1:corrupt', '{not json');
    expect(readJSON('corrupt', 'fallback')).toBe('fallback');
  });
});
