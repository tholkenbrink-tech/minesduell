import { Button } from './ui';

export function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-[var(--md-radius-lg)] border border-[var(--md-border)] bg-[var(--md-surface)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="rules-title" className="text-xl font-bold">
          How to play
        </h2>
        <div className="mt-4 flex flex-col gap-3 text-sm">
          <p>
            <strong>Reveal vs. Flag:</strong> pick an action mode with the segmented control near your side of the
            screen. Tap a tile to Reveal it, or switch to Flag to mark suspected mines. On a mouse, left click always
            reveals and right click always flags.
          </p>
          <p>
            <strong>Numbers:</strong> a revealed tile shows how many mines are hiding in its 8 neighboring tiles.
            Revealing a tile with zero neighboring mines automatically opens up the surrounding safe area.
          </p>
          <p>
            <strong>Turns:</strong> in Duell, only the active player can act. In the default streak mode you keep your
            turn on every correct move and only hand over when you make a mistake. In Co-op the turn rotates after
            every action so everyone shares the risk.
          </p>
          <p>
            <strong>Mistakes:</strong> the only two mistakes are revealing a mine or flagging a safe tile by accident.
            Either one ends your turn (and costs a life where lives are enabled). A revealed mine stays revealed — it's
            simply out of play and never blocks finishing the board.
          </p>
          <p>
            <strong>Race privacy:</strong> each player gets an identical board, but nobody can see another player's
            attempt until everyone has finished.
          </p>
          <p>
            <strong>Face-to-face:</strong> on a tablet between two players, the board stays put but the numbers,
            names, and controls flip 180° for whoever's turn it is — no need to rotate the device.
          </p>
          <p>
            <strong>Panning a big board:</strong> use two fingers to drag the board around, or scroll with a mouse
            wheel or trackpad. One-finger taps always act on a tile and never pan.
          </p>
        </div>
        <Button className="mt-6 w-full" onClick={onClose}>
          Got it
        </Button>
      </div>
    </div>
  );
}
