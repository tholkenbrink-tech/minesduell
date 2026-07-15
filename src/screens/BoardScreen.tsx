import { useCallback, useEffect, useState } from 'react';
import { useMatchStore, type MatchState } from '../store/useMatchStore';
import { usePrefsStore } from '../store/usePrefsStore';
import { countRemainingMines } from '../engine/board';
import type { GameEvent, Position } from '../engine/types';
import type { DuelState } from '../engine/duel';
import type { RaceState } from '../engine/race';
import type { CoopState } from '../engine/coop';
import { BoardView } from '../components/board/BoardView';
import { FaceToFaceBoard } from '../components/board/FaceToFaceBoard';
import { PlayerStatusCard } from '../components/hud/PlayerStatusCard';
import { TurnTimer } from '../components/hud/TurnTimer';
import { SegmentedControl, Button } from '../components/ui';
import { PauseMenu } from '../components/PauseMenu';
import { TurnTransitionOverlay } from '../components/TurnTransitionOverlay';
import { RaceHandover } from '../components/RaceHandover';

/** Position of the tile behind the latest mistake, for the brief tile shake. */
function mistakePosFromEvents(events: GameEvent[]): Position | null {
  const e = events.find(
    (ev) => ev.type === 'MINE_REVEALED' || ev.type === 'SAFE_CELL_INCORRECTLY_FLAGGED',
  );
  return e?.position ?? null;
}

export function BoardScreen() {
  const match = useMatchStore((s) => s.match) as MatchState | null;
  const mode = useMatchStore((s) => s.mode);
  const players = useMatchStore((s) => s.players);
  const settings = useMatchStore((s) => s.settings);
  const actionMode = useMatchStore((s) => s.actionMode);
  const setActionMode = useMatchStore((s) => s.setActionMode);
  const paused = useMatchStore((s) => s.paused);
  const setPaused = useMatchStore((s) => s.setPaused);
  const turnTransition = useMatchStore((s) => s.turnTransition);
  const announce = useMatchStore((s) => s.announce);
  const reveal = useMatchStore((s) => s.reveal);
  const flag = useMatchStore((s) => s.flag);
  const expireTimer = useMatchStore((s) => s.expireTimer);
  const startRaceRun = useMatchStore((s) => s.startRaceRun);
  const giveUpRace = useMatchStore((s) => s.giveUpRace);
  const peekAt = useMatchStore((s) => s.peekAt);
  const dismissPeek = useMatchStore((s) => s.dismissPeek);
  const feed = useMatchStore((s) => s.feed);
  const lastEvents = useMatchStore((s) => s.lastEvents);
  const tileSizePref = usePrefsStore((s) => s.tileSize);

  const [showConfirm, setShowConfirm] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setPaused(!paused);
      if (e.key.toLowerCase() === 'r') setActionMode('reveal');
      if (e.key.toLowerCase() === 'f') setActionMode('flag');
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [paused, setPaused, setActionMode]);

  const handleAction = useCallback(
    (kind: 'reveal' | 'flag', pos: { x: number; y: number }) => {
      if (mode === 'coop' && (match as CoopState)?.pendingPeek && (match as CoopState).pendingPeek!.position.x === -1) {
        peekAt(pos);
        return;
      }
      if (kind === 'reveal' && settings.confirmDangerousReveal) {
        setShowConfirm(pos);
        return;
      }
      if (kind === 'reveal') reveal(pos);
      else flag(pos);
    },
    [mode, match, peekAt, reveal, flag, settings.confirmDangerousReveal],
  );

  if (!match) return null;

  const face2face = settings.arrangement === 'face-to-face';

  if (mode === 'race') {
    const raceState = match as RaceState;
    const currentPlayer = players[raceState.currentIndex];
    if (raceState.phase === 'handover') {
      return <RaceHandover player={currentPlayer} onStart={startRaceRun} />;
    }
    const run = raceState.runs[currentPlayer.id];
    return (
      <div className="flex h-full flex-col gap-3 p-3">
        <div aria-live="polite" className="sr-only">
          {announce}
        </div>
        <div className={`flex items-center justify-between gap-3 ${settings.leftHanded ? 'flex-row-reverse' : ''}`}>
          <PlayerStatusCard player={currentPlayer} stats={run.stats} active showLives />
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">💣 {countRemainingMines(run.board)} left</span>
            <SegmentedControl
              ariaLabel="Action mode"
              value={actionMode}
              onChange={setActionMode}
              options={[
                { value: 'reveal', label: '🔍 Reveal' },
                { value: 'flag', label: '🚩 Flag' },
              ]}
            />
            <Button variant="ghost" onClick={() => setPaused(true)} aria-label="Pause">
              ⏸
            </Button>
          </div>
        </div>
        <div className="relative min-h-0 flex-1">
          <BoardView
            board={run.board}
            players={players}
            activePlayerId={currentPlayer.id}
            actionMode={actionMode}
            disabled={paused}
            tileSizePref={tileSizePref}
            onAction={handleAction}
          />
        </div>
        <Button variant="secondary" onClick={giveUpRace}>
          Give up run
        </Button>
        {paused && <PauseMenu onClose={() => setPaused(false)} />}
      </div>
    );
  }

  if (mode === 'coop') {
    const coop = match as CoopState;
    const active = players[coop.activePlayerIndex];
    const orientationDeg = face2face && coop.activePlayerIndex === 1 ? 180 : 0;
    const pendingSelection = coop.pendingPeek && coop.pendingPeek.position.x === -1;
    const peekResolved = coop.pendingPeek && coop.pendingPeek.position.x !== -1;

    if (face2face && players.length === 2) {
      return (
        <>
          <div aria-live="polite" className="sr-only">
            {announce}
          </div>
          <FaceToFaceBoard
            players={players}
            board={coop.board}
            stats={coop.stats}
            activePlayerIndex={coop.activePlayerIndex}
            showLives
            minesLeft={countRemainingMines(coop.board)}
            actionMode={actionMode}
            setActionMode={setActionMode}
            onAction={handleAction}
            onPause={() => setPaused(true)}
            disabled={paused || turnTransition.active || Boolean(peekResolved)}
            tileSizePref={tileSizePref}
            feed={feed}
            mistakePos={mistakePosFromEvents(lastEvents)}
            timer={
              settings.coopTeamTimerSeconds > 0
                ? {
                    seconds: settings.coopTeamTimerSeconds,
                    resetKey: 'coop-team-timer',
                    paused: paused || turnTransition.active,
                    onExpire: expireTimer,
                    ownerIndex: 0,
                  }
                : null
            }
          >
            {(pendingSelection || peekResolved) && (
              <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center px-3">
                <p className="pointer-events-auto flex items-center gap-2 rounded-full border border-[var(--md-border)] bg-[var(--md-surface)] px-4 py-2 text-sm font-semibold shadow-[var(--md-shadow-md)]">
                  {pendingSelection
                    ? `Peek ready — tap a hidden tile before ${active.name}'s move.`
                    : `That tile looks ${coop.pendingPeek!.safe ? 'safe.' : 'dangerous!'}`}
                  {peekResolved && (
                    <Button variant="secondary" onClick={dismissPeek}>
                      Continue
                    </Button>
                  )}
                </p>
              </div>
            )}
            {turnTransition.active && (
              <TurnTransitionOverlay player={players.find((p) => p.name === turnTransition.playerName)} />
            )}
          </FaceToFaceBoard>
          {paused && <PauseMenu onClose={() => setPaused(false)} />}
          {showConfirm && (
            <ConfirmReveal
              onCancel={() => setShowConfirm(null)}
              onConfirm={() => {
                reveal(showConfirm);
                setShowConfirm(null);
              }}
            />
          )}
        </>
      );
    }

    return (
      <div className="flex h-full flex-col gap-3 p-3">
        <div aria-live="polite" className="sr-only">
          {announce}
        </div>
        <div className={`flex flex-wrap items-center justify-between gap-2 ${settings.leftHanded ? 'flex-row-reverse' : ''}`}>
          <div className="flex flex-wrap gap-2">
            {players.map((p) => (
              <PlayerStatusCard
                key={p.id}
                player={p}
                stats={coop.stats[p.id]}
                active={p.id === active.id}
                showLives
                compact
              />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">🏆 {coop.teamScore}</span>
            <span className="text-sm font-semibold">💣 {countRemainingMines(coop.board)} left</span>
            {settings.coopTeamTimerSeconds > 0 && (
              <TurnTimer
                seconds={settings.coopTeamTimerSeconds}
                resetKey="coop-team-timer"
                paused={paused || turnTransition.active}
                onExpire={expireTimer}
              />
            )}
            <SegmentedControl
              ariaLabel="Action mode"
              value={actionMode}
              onChange={setActionMode}
              options={[
                { value: 'reveal', label: '🔍 Reveal' },
                { value: 'flag', label: '🚩 Flag' },
              ]}
            />
            <Button variant="ghost" onClick={() => setPaused(true)} aria-label="Pause">
              ⏸
            </Button>
          </div>
        </div>
        {pendingSelection && (
          <p className="rounded-[var(--md-radius-md)] bg-[var(--md-cell-flag-bg)] px-3 py-2 text-sm font-semibold">
            Peek reward ready — tap any hidden tile to inspect it before {active.name}'s move.
          </p>
        )}
        {peekResolved && (
          <p className="flex items-center justify-between rounded-[var(--md-radius-md)] bg-[var(--md-cell-flag-bg)] px-3 py-2 text-sm font-semibold">
            That tile looks {coop.pendingPeek!.safe ? 'safe.' : 'dangerous!'}
            <Button variant="secondary" onClick={dismissPeek}>
              Continue
            </Button>
          </p>
        )}
        <div className="relative min-h-0 flex-1">
          <BoardView
            board={coop.board}
            players={players}
            activePlayerId={active.id}
            actionMode={actionMode}
            disabled={paused || turnTransition.active || Boolean(peekResolved)}
            tileSizePref={tileSizePref}
            orientationDeg={orientationDeg}
            peekPosition={coop.pendingPeek && coop.pendingPeek.position.x !== -1 ? coop.pendingPeek.position : null}
            peekSafe={coop.pendingPeek?.safe}
            onAction={handleAction}
          />
          {turnTransition.active && <TurnTransitionOverlay player={players.find((p) => p.name === turnTransition.playerName)} />}
        </div>
        {paused && <PauseMenu onClose={() => setPaused(false)} />}
        {showConfirm && (
          <ConfirmReveal
            onCancel={() => setShowConfirm(null)}
            onConfirm={() => {
              reveal(showConfirm);
              setShowConfirm(null);
            }}
          />
        )}
      </div>
    );
  }

  const duel = match as DuelState;
  const active = players[duel.activePlayerIndex];
  const orientationDeg = face2face && duel.activePlayerIndex === 1 ? 180 : 0;

  if (face2face && players.length === 2) {
    return (
      <>
        <div aria-live="polite" className="sr-only">
          {announce}
        </div>
        <FaceToFaceBoard
          players={players}
          board={duel.board}
          stats={duel.stats}
          activePlayerIndex={duel.activePlayerIndex}
          showLives={duel.settings.duelVariant === 'survival'}
          minesLeft={countRemainingMines(duel.board)}
          actionMode={actionMode}
          setActionMode={setActionMode}
          onAction={handleAction}
          onPause={() => setPaused(true)}
          disabled={paused || turnTransition.active}
          tileSizePref={tileSizePref}
          feed={feed}
          mistakePos={mistakePosFromEvents(lastEvents)}
          timer={
            duel.settings.duelTimer.enabled
              ? {
                  seconds: duel.settings.duelTimer.seconds,
                  resetKey: `${duel.activePlayerIndex}-${duel.turnActionsCount}`,
                  paused: paused || turnTransition.active,
                  onExpire: expireTimer,
                  ownerIndex: duel.activePlayerIndex,
                }
              : null
          }
        >
          {turnTransition.active && (
            <TurnTransitionOverlay player={players.find((p) => p.name === turnTransition.playerName)} />
          )}
        </FaceToFaceBoard>
        {paused && <PauseMenu onClose={() => setPaused(false)} />}
        {showConfirm && (
          <ConfirmReveal
            onCancel={() => setShowConfirm(null)}
            onConfirm={() => {
              reveal(showConfirm);
              setShowConfirm(null);
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>
      <div className={`flex flex-wrap items-center justify-between gap-2 ${settings.leftHanded ? 'flex-row-reverse' : ''}`}>
        <div className="flex flex-wrap gap-2">
          {players.map((p) => (
            <PlayerStatusCard key={p.id} player={p} stats={duel.stats[p.id]} active={p.id === active.id} showLives={duel.settings.duelVariant === 'survival'} />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">💣 {countRemainingMines(duel.board)} left</span>
          {duel.settings.duelTimer.enabled && (
            <TurnTimer
              // Reset on every action (turnActionsCount) as well as on turn
              // change (activePlayerIndex) — so an actively-playing streak never
              // times out. The timer only passes the turn when it runs out
              // without the player acting.
              seconds={duel.settings.duelTimer.seconds}
              resetKey={`${duel.activePlayerIndex}-${duel.turnActionsCount}`}
              paused={paused || turnTransition.active}
              onExpire={expireTimer}
            />
          )}
          <SegmentedControl
            ariaLabel="Action mode"
            value={actionMode}
            onChange={setActionMode}
            options={[
              { value: 'reveal', label: '🔍 Reveal' },
              { value: 'flag', label: '🚩 Flag' },
            ]}
          />
          <Button variant="ghost" onClick={() => setPaused(true)} aria-label="Pause">
            ⏸
          </Button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <BoardView
          board={duel.board}
          players={players}
          activePlayerId={active.id}
          actionMode={actionMode}
          disabled={paused || turnTransition.active}
          tileSizePref={tileSizePref}
          orientationDeg={orientationDeg}
          onAction={handleAction}
        />
        {turnTransition.active && <TurnTransitionOverlay player={players.find((p) => p.name === turnTransition.playerName)} />}
      </div>
      {paused && <PauseMenu onClose={() => setPaused(false)} />}
      {showConfirm && (
        <ConfirmReveal
          onCancel={() => setShowConfirm(null)}
          onConfirm={() => {
            reveal(showConfirm);
            setShowConfirm(null);
          }}
        />
      )}
    </div>
  );
}

function ConfirmReveal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xs rounded-[var(--md-radius-lg)] border border-[var(--md-border)] bg-[var(--md-surface)] p-5 text-center">
        <p className="font-semibold">Reveal this tile?</p>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={onConfirm}>
            Reveal
          </Button>
        </div>
      </div>
    </div>
  );
}
