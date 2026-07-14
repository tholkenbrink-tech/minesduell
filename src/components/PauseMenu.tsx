import { useState } from 'react';
import { usePrefsStore } from '../store/usePrefsStore';
import { useMatchStore } from '../store/useMatchStore';
import { Button, Toggle } from './ui';
import { RulesModal } from './RulesModal';

export function PauseMenu({ onClose }: { onClose: () => void }) {
  const prefs = usePrefsStore();
  const restartRound = useMatchStore((s) => s.restartRound);
  const clearActiveMatch = useMatchStore((s) => s.clearActiveMatch);
  const [showRules, setShowRules] = useState(false);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="pause-title" className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-[var(--md-radius-lg)] border border-[var(--md-border)] bg-[var(--md-surface)] p-6">
        <h2 id="pause-title" className="text-xl font-bold">
          Paused
        </h2>
        <div className="mt-4 flex flex-col gap-1">
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
