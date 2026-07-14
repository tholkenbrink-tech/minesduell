import { useMemo } from 'react';
import { useMatchStore } from '../store/useMatchStore';
import { usePrefsStore } from '../store/usePrefsStore';
import { DIFFICULTY_PRESETS, type DifficultyPreset, type DeviceArrangement } from '../engine/types';
import { validateBoardConfig } from '../engine/board';
import { estimateDifficultyLabel, estimateDurationMinutes } from '../engine/defaults';
import { Button, Card, NumberField, SegmentedControl, Toggle } from '../components/ui';

const PRESET_OPTIONS: { value: DifficultyPreset; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
  { value: 'extreme', label: 'Extreme' },
  { value: 'custom', label: 'Custom' },
];

const ARRANGEMENT_OPTIONS: { value: DeviceArrangement; label: string }[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'side-by-side', label: 'Side-by-side' },
  { value: 'face-to-face', label: 'Face-to-face' },
  { value: 'table', label: 'Table' },
];

export function GameConfigScreen() {
  const mode = useMatchStore((s) => s.mode);
  const settings = useMatchStore((s) => s.settings);
  const players = useMatchStore((s) => s.players);
  const updateSettings = useMatchStore((s) => s.updateSettings);
  const startGame = useMatchStore((s) => s.startGame);
  const goToModeSelect = useMatchStore((s) => s.goToModeSelect);
  const prefs = usePrefsStore();

  const validation = useMemo(
    () => validateBoardConfig(settings.board.width, settings.board.height, settings.board.mines),
    [settings.board.width, settings.board.height, settings.board.mines],
  );
  const difficulty = estimateDifficultyLabel(settings);
  const duration = estimateDurationMinutes(settings, players.length || 2);

  function applyPreset(preset: DifficultyPreset) {
    if (preset === 'custom') {
      updateSettings({ board: { ...settings.board, preset } });
      return;
    }
    updateSettings({ board: { ...DIFFICULTY_PRESETS[preset] } });
  }

  const invalidDuelTarget =
    mode === 'duel' &&
    settings.duelTarget.type === 'first-to' &&
    (settings.duelTarget.count ?? 0) > settings.board.mines;

  const canStart = validation.valid && !invalidDuelTarget;

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div>
        <button className="focus-ring text-sm text-[var(--md-text-muted)]" onClick={goToModeSelect}>
          ← Start over
        </button>
        <h1 className="mt-2 text-3xl font-extrabold">Game settings</h1>
        <p className="text-sm text-[var(--md-text-muted)]">
          Estimated difficulty: <strong>{difficulty}</strong> · Approx. {duration} min
        </p>
      </div>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="text-lg font-bold">Board</h2>
        <div className="flex flex-wrap gap-2">
          <SegmentedControl
            ariaLabel="Difficulty preset"
            value={settings.board.preset}
            onChange={applyPreset}
            options={PRESET_OPTIONS}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <NumberField
            id="board-width"
            label="Width"
            min={6}
            max={50}
            value={settings.board.width}
            onChange={(v) => updateSettings({ board: { ...settings.board, width: v, preset: 'custom' } })}
          />
          <NumberField
            id="board-height"
            label="Height"
            min={6}
            max={50}
            value={settings.board.height}
            onChange={(v) => updateSettings({ board: { ...settings.board, height: v, preset: 'custom' } })}
          />
          <NumberField
            id="board-mines"
            label="Mines"
            min={1}
            max={validation.maxMines}
            value={settings.board.mines}
            onChange={(v) => updateSettings({ board: { ...settings.board, mines: v, preset: 'custom' } })}
          />
        </div>
        {!validation.valid && <p className="text-sm text-[var(--md-danger)]">{validation.reason}</p>}
        {validation.valid && (
          <p className="text-xs text-[var(--md-text-muted)]">
            Up to {validation.maxMines} mines keeps the first reveal guaranteed-safe on this board size.
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-1 p-4">
        <h2 className="text-lg font-bold">Device arrangement</h2>
        <p className="mb-2 text-xs text-[var(--md-text-muted)]">
          Desktop always uses side-by-side. Face-to-face rotates controls, not the board.
        </p>
        <SegmentedControl
          ariaLabel="Device arrangement"
          value={settings.arrangement}
          onChange={(v) => updateSettings({ arrangement: v })}
          options={ARRANGEMENT_OPTIONS}
        />
      </Card>

      {mode === 'duel' && (
        <Card className="flex flex-col gap-1 p-4">
          <h2 className="text-lg font-bold">Duell rules</h2>
          <SegmentedControl
            ariaLabel="Duell variant"
            value={settings.duelVariant}
            onChange={(v) => updateSettings({ duelVariant: v })}
            options={[
              { value: 'streak', label: 'Streak' },
              { value: 'classic', label: 'Classic' },
              { value: 'survival', label: 'Survival' },
            ]}
          />
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Target</span>
              <select
                value={settings.duelTarget.type}
                onChange={(e) =>
                  updateSettings({ duelTarget: { ...settings.duelTarget, type: e.target.value as typeof settings.duelTarget.type } })
                }
                className="focus-ring rounded-[var(--md-radius-sm)] border border-[var(--md-border)] bg-[var(--md-surface)] px-3 py-2"
              >
                <option value="first-to">First to N mines</option>
                <option value="majority">Majority of mines</option>
                <option value="complete-board">Complete board</option>
              </select>
            </label>
            {settings.duelTarget.type === 'first-to' && (
              <NumberField
                id="duel-target-count"
                label="N"
                min={1}
                max={settings.board.mines}
                value={settings.duelTarget.count ?? 10}
                onChange={(v) => updateSettings({ duelTarget: { ...settings.duelTarget, count: v } })}
              />
            )}
          </div>
          {invalidDuelTarget && (
            <p className="text-sm text-[var(--md-danger)]">Target can't exceed the {settings.board.mines} mines on the board.</p>
          )}
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <Toggle
              checked={settings.duelTimer.enabled}
              onChange={(v) => updateSettings({ duelTimer: { ...settings.duelTimer, enabled: v } })}
              label="Turn timer"
            />
            {settings.duelTimer.enabled && (
              <>
                <NumberField
                  id="duel-timer-seconds"
                  label="Seconds"
                  min={3}
                  max={120}
                  value={settings.duelTimer.seconds}
                  onChange={(v) => updateSettings({ duelTimer: { ...settings.duelTimer, seconds: v } })}
                />
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">On expiry</span>
                  <select
                    value={settings.duelTimer.behavior}
                    onChange={(e) => updateSettings({ duelTimer: { ...settings.duelTimer, behavior: e.target.value as typeof settings.duelTimer.behavior } })}
                    className="focus-ring rounded-[var(--md-radius-sm)] border border-[var(--md-border)] bg-[var(--md-surface)] px-3 py-2"
                  >
                    <option value="pass-turn">Pass turn</option>
                    <option value="elimination">Lose a life</option>
                    <option value="sudden-death">Sudden death</option>
                  </select>
                </label>
              </>
            )}
          </div>
        </Card>
      )}

      {mode === 'race' && (
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-lg font-bold">Race rules</h2>
          <div className="flex flex-wrap items-end gap-3">
            <NumberField
              id="race-lives"
              label="Lives"
              min={1}
              max={9}
              value={settings.raceLives}
              onChange={(v) => updateSettings({ raceLives: v })}
            />
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Scoring</span>
              <select
                value={settings.raceScoring}
                onChange={(e) => updateSettings({ raceScoring: e.target.value as typeof settings.raceScoring })}
                className="focus-ring rounded-[var(--md-radius-sm)] border border-[var(--md-border)] bg-[var(--md-surface)] px-3 py-2"
              >
                <option value="time">Time Race</option>
                <option value="click">Click Race</option>
                <option value="survival">Survival Race</option>
              </select>
            </label>
          </div>
          <Toggle
            checked={settings.raceFlagCostsLife}
            onChange={(v) => updateSettings({ raceFlagCostsLife: v })}
            label="Incorrect flags cost a life"
            description="Harder mode. Off by default."
          />
        </Card>
      )}

      {mode === 'coop' && (
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-lg font-bold">Co-op rules</h2>
          <div className="flex flex-wrap items-end gap-3">
            <NumberField
              id="coop-lives"
              label="Lives per player"
              min={1}
              max={settings.coopLifeCap}
              value={settings.coopLives}
              onChange={(v) => updateSettings({ coopLives: v })}
            />
            <NumberField
              id="coop-life-cap"
              label="Life cap"
              min={settings.coopLives}
              max={9}
              value={settings.coopLifeCap}
              onChange={(v) => updateSettings({ coopLifeCap: v })}
            />
          </div>
          <Toggle
            checked={settings.coopRewards.extraLife}
            onChange={(v) => updateSettings({ coopRewards: { ...settings.coopRewards, extraLife: v } })}
            label="Extra Life reward"
            description="Restore a life after 3 correct mine flags in a row."
          />
          <Toggle
            checked={settings.coopRewards.peek}
            onChange={(v) => updateSettings({ coopRewards: { ...settings.coopRewards, peek: v } })}
            label="Peek reward"
            description="Inspect one hidden tile (safe or dangerous) before acting."
          />
          <Toggle
            checked={settings.coopEndless}
            onChange={(v) => updateSettings({ coopEndless: v })}
            label="Endless mode"
            description={`Keep going across boards until ${settings.coopEndlessMilestone} mines detected.`}
          />
        </Card>
      )}

      <Card className="flex flex-col gap-1 p-4">
        <h2 className="text-lg font-bold">General</h2>
        <Toggle checked={settings.firstRevealSafe} onChange={(v) => updateSettings({ firstRevealSafe: v })} label="First reveal is always safe" />
        <Toggle checked={prefs.sound} onChange={(v) => prefs.setPref('sound', v)} label="Sound" />
        <Toggle checked={prefs.haptics} onChange={(v) => prefs.setPref('haptics', v)} label="Haptic feedback" />
        <Toggle checked={prefs.reducedMotion} onChange={(v) => prefs.setPref('reducedMotion', v)} label="Reduce motion" />
        <Toggle
          checked={settings.confirmDangerousReveal}
          onChange={(v) => updateSettings({ confirmDangerousReveal: v })}
          label="Confirm before risky reveals"
          description="Ask before revealing a tile next to a flagged mine."
        />
        <Toggle checked={settings.leftHanded} onChange={(v) => updateSettings({ leftHanded: v })} label="Left-handed control placement" />
      </Card>

      <Button className="w-full" disabled={!canStart} onClick={startGame}>
        Start game
      </Button>
    </div>
  );
}
