import { useState } from 'react';
import { usePrefsStore } from '../store/usePrefsStore';
import { useMatchStore } from '../store/useMatchStore';
import { Button, SegmentedControl, Toggle } from './ui';
import { RulesModal } from './RulesModal';
import type { DeviceArrangement } from '../engine/types';
import type { SeatPosition } from '../engine/arrangement';
import {
  SEAT_ROTATION,
  arrangementDisabledReason,
  defaultSeats,
  emptyTableSide,
  isArrangementCompatible,
} from '../engine/arrangement';

const ARRANGEMENT_LABELS: { value: DeviceArrangement; label: string }[] = [
  { value: 'side-by-side', label: 'Side-by-side' },
  { value: 'face-to-face', label: 'Face-to-face' },
  { value: 'table', label: 'Table' },
];

const SIDE_LABELS: Record<SeatPosition, string> = {
  bottom: 'Bottom',
  right: 'Right',
  top: 'Top',
  left: 'Left',
};

export function PauseMenu({ onClose }: { onClose: () => void }) {
  const prefs = usePrefsStore();
  const restartRound = useMatchStore((s) => s.restartRound);
  const clearActiveMatch = useMatchStore((s) => s.clearActiveMatch);
  const players = useMatchStore((s) => s.players);
  const seats = useMatchStore((s) => s.seats);
  const arrangement = useMatchStore((s) => s.settings.arrangement);
  const setArrangement = useMatchStore((s) => s.setArrangement);
  const [showRules, setShowRules] = useState(false);

  const playerIds = players.map((p) => p.id);
  const isTable3 = arrangement === 'table' && players.length === 3;
  const isFaceToFace = (arrangement === 'face-to-face' || (arrangement === 'table' && players.length === 2)) && players.length === 2;

  function swapFaceToFaceSeats() {
    // Swap which physical side each player sits on. Turn order (playerId ↔
    // turnOrder) is preserved — only the seat position/rotation changes.
    const swapped = seats.map((s) => {
      const position: SeatPosition = s.position === 'bottom' ? 'top' : 'bottom';
      return { ...s, position, rotation: SEAT_ROTATION[position] };
    });
    setArrangement(arrangement, swapped);
  }

  function chooseEmptySide(emptySide: SeatPosition) {
    setArrangement('table', defaultSeats('table', playerIds, { emptySide }));
  }

  const currentEmpty = emptyTableSide(seats);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="pause-title" className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-[var(--md-radius-lg)] border border-[var(--md-border)] bg-[var(--md-surface)] p-6">
        <h2 id="pause-title" className="text-xl font-bold">
          Paused
        </h2>

        <section className="mt-4">
          <h3 className="text-sm font-bold text-[var(--md-text-muted)]">Device arrangement</h3>
          <p className="mb-2 text-xs text-[var(--md-text-muted)]">
            Changing this keeps the current game exactly as it is — same board,
            scores, and turn. It stays paused until you resume.
          </p>
          <SegmentedControl
            ariaLabel="Device arrangement"
            value={arrangement}
            onChange={(v) => setArrangement(v)}
            options={ARRANGEMENT_LABELS.map((o) => ({
              ...o,
              disabled: !isArrangementCompatible(o.value, players.length),
              title: arrangementDisabledReason(o.value, players.length) ?? undefined,
            }))}
            columns={3}
          />
          {!isArrangementCompatible('face-to-face', players.length) && (
            <p className="mt-1 text-xs text-[var(--md-text-muted)]">
              Face-to-face needs exactly 2 players.
            </p>
          )}

          {isFaceToFace && (
            <Button variant="secondary" className="mt-2 w-full" onClick={swapFaceToFaceSeats}>
              ⇅ Swap sides
            </Button>
          )}

          {isTable3 && (
            <div className="mt-2">
              <p className="mb-1 text-xs text-[var(--md-text-muted)]">Empty side</p>
              <SegmentedControl
                ariaLabel="Empty table side"
                value={currentEmpty ?? 'left'}
                onChange={(v) => chooseEmptySide(v as SeatPosition)}
                options={(['bottom', 'right', 'top', 'left'] as SeatPosition[]).map((p) => ({
                  value: p,
                  label: SIDE_LABELS[p],
                }))}
                columns={4}
              />
            </div>
          )}
        </section>

        <div className="mt-5 flex flex-col gap-1">
          <Toggle checked={prefs.sound} onChange={(v) => prefs.setPref('sound', v)} label="Sound" />
          <Toggle checked={prefs.haptics} onChange={(v) => prefs.setPref('haptics', v)} label="Haptics" />
          <Toggle checked={prefs.reducedMotion} onChange={(v) => prefs.setPref('reducedMotion', v)} label="Reduced motion" />
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={onClose}>Resume</Button>
          <Button variant="secondary" onClick={() => setShowRules(true)}>
            Review rules
          </Button>
          <Button variant="secondary" onClick={restartRound}>
            Restart round
          </Button>
          <Button variant="danger" onClick={clearActiveMatch}>
            Quit to setup
          </Button>
        </div>
      </div>
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}
