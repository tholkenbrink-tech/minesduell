import { beforeEach, describe, expect, it, vi } from 'vitest';

// The prefs store reads localStorage once at module init, so each test resets
// modules + storage and dynamically imports a fresh store instance.
const KEY = 'minesduell:v1:preferences';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe('prefs — control anchors (per player slot)', () => {
  it('defaults every slot to null (= use the arrangement default)', async () => {
    const { usePrefsStore } = await import('../usePrefsStore');
    expect(usePrefsStore.getState().controlAnchors).toEqual([null, null, null, null]);
  });

  it('setControlAnchor updates the slot and persists it for next match', async () => {
    const { usePrefsStore } = await import('../usePrefsStore');
    usePrefsStore.getState().setControlAnchor(1, 'top');
    expect(usePrefsStore.getState().controlAnchors[1]).toBe('top');

    const saved = JSON.parse(localStorage.getItem(KEY)!);
    expect(saved.controlAnchors[1]).toBe('top');
    // Other slots untouched.
    expect(saved.controlAnchors[0]).toBeNull();
  });

  it('clearing a slot with null restores the arrangement default', async () => {
    const { usePrefsStore } = await import('../usePrefsStore');
    usePrefsStore.getState().setControlAnchor(0, 'center');
    usePrefsStore.getState().setControlAnchor(0, null);
    expect(usePrefsStore.getState().controlAnchors[0]).toBeNull();
  });

  it('grows the list if a later slot is set on a shorter legacy array', async () => {
    localStorage.setItem(KEY, JSON.stringify({ controlAnchors: ['bottom'] }));
    const { usePrefsStore } = await import('../usePrefsStore');
    usePrefsStore.getState().setControlAnchor(3, 'left');
    const anchors = usePrefsStore.getState().controlAnchors;
    expect(anchors[3]).toBe('left');
    expect(anchors[0]).toBe('bottom');
  });

  it('migrates legacy prefs saved before the field existed', async () => {
    // A preferences blob written by an older build has no controlAnchors key.
    localStorage.setItem(KEY, JSON.stringify({ sound: true, theme: 'dark' }));
    const { usePrefsStore } = await import('../usePrefsStore');
    const s = usePrefsStore.getState();
    expect(s.controlAnchors).toEqual([null, null, null, null]);
    // The values it did have survive the merge.
    expect(s.sound).toBe(true);
    expect(s.theme).toBe('dark');
  });
});
