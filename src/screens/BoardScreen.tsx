import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useMatchStore, type MatchState } from '../store/useMatchStore';
import { usePrefsStore } from '../store/usePrefsStore';
import { countRemainingMines } from '../engine/board';
import type { GameEvent, Position } from '../engine/types';
import type { DuelState } from '../engine/duel';
import { duelHasLives, duelTargetCount } from '../engine/duel';
import type { RaceState } from '../engine/race';
import type { CoopState } from '../engine/coop';
import { BoardView, type BoardZoomApi } from '../components/board/BoardView';
import { SeatedBoard } from '../components/board/SeatedBoard';
import { ControlDock } from '../components/board/ControlDock';
import { isArrangementCompatible, renderArrangement, resolveControlAnchor, seatForPlayer } from '../engine/arrangement';
import { PlayerStatusCard } from '../components/hud/PlayerStatusCard';
import { PlayerRail } from '../components/hud/PlayerRail';
import { TurnTimer } from '../components/hud/TurnTimer';
import { Button, ConfirmDialog, HudIconButton, PauseButton } from '../components/ui';
import { PauseMenu } from '../components/PauseMenu';
import { TurnTransitionOverlay } from '../components/TurnTransitionOverlay';
import { RaceHandover } from '../components/RaceHandover';
import { useIsLandscape } from '../hooks/useMediaQuery';
import { Icon } from '../components/icons';

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
  const seats = useMatchStore((s) => s.seats);
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
  const lastEvents = useMatchStore((s) => s.lastEvents);
  const endHold = useMatchStore((s) => s.endHold);
  const tileSizePref = usePrefsStore((s) => s.tileSize);
  const controlAnchors = usePrefsStore((s) => s.controlAnchors);
  const oneFingerScroll = usePrefsStore((s) => s.oneFingerScroll);
  const setPref = usePrefsStore((s) => s.setPref);
  const setControlAnchor = usePrefsStore((s) => s.setControlAnchor);

  const [showConfirm, setShowConfirm] = useState<{ x: number; y: number } | null>(null);
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  // Where the control bar parks. Held horizontally, height is the scarce axis,
  // so it rides in the header bar that already exists. Held upright there is
  // height to spare but the header is narrow — sharing that row would squeeze
  // the stats into a scrolling strip — so it gets its own line under the board.
  const dockOnTop = useIsLandscape();
  // The round is over and its board is being held on screen (END_HOLD_MS) so
  // the losing move can actually be read. Nothing is playable during it.
  const holding = endHold !== null;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setPaused(!paused);
      if (e.key.toLowerCase() === 'r') setActionMode('reveal');
      if (e.key.toLowerCase() === 'f') setActionMode('flag');
      if (e.key.toLowerCase() === 's') setPref('oneFingerScroll', !oneFingerScroll);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [paused, setPaused, setActionMode, setPref, oneFingerScroll]);

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

  // The movable Reveal/Mark control dock for whichever player is active. It sits
  // over the play field, defaults to the active seat's side (bottom for
  // side-by-side), and is re-anchored + persisted per player slot. `rotation`
  // keeps the toggle upright for that seat regardless of where it's docked.
  const buildDock = (activeIndex: number) => (zoom: BoardZoomApi) => {
    const seat = seatForPlayer(seats, players[activeIndex]?.id);
    return (
      <ControlDock
        slotIndex={activeIndex}
        anchor={resolveControlAnchor(controlAnchors[activeIndex], seat?.position)}
        rotation={seat?.rotation ?? 0}
        actionMode={actionMode}
        setActionMode={setActionMode}
        oneFingerScroll={oneFingerScroll}
        setOneFingerScroll={(on) => setPref('oneFingerScroll', on)}
        zoom={zoom}
        onAnchorChange={setControlAnchor}
      />
    );
  };

  if (!match) return null;

  // The selected arrangement is the source of truth. Device size never changes
  // it — it only picks compact vs. roomy presentation inside SeatedBoard. Table
  // with two players renders the Face-to-Face shell (renderArrangement), and an
  // incompatible selection (shouldn't happen — config disables those) falls back
  // to the neutral side-by-side layout rather than breaking.
  const rendered = renderArrangement(settings.arrangement, players.length);
  const seatedVariant: 'face-to-face' | 'table' | null =
    isArrangementCompatible(settings.arrangement, players.length) &&
    (rendered === 'face-to-face' || rendered === 'table')
      ? rendered
      : null;

  if (mode === 'race') {
    const raceState = match as RaceState;
    // While holding, keep the finished player's run on screen — the engine has
    // already advanced to the next player, whose board is still blank.
    const shownIndex = endHold?.raceRunIndex ?? raceState.currentIndex;
    const currentPlayer = players[shownIndex];
    if (raceState.phase === 'handover' && !holding) {
      return <RaceHandover player={currentPlayer} onStart={startRaceRun} />;
    }
    const run = raceState.runs[currentPlayer.id];
    return (
      <div className="flex h-full flex-col gap-2 p-2 sm:gap-3 sm:p-3">
        <div aria-live="polite" className="sr-only">
          {announce}
        </div>
        <div className={`flex items-center justify-between gap-2 text-xs sm:gap-3 sm:text-sm ${settings.leftHanded ? 'flex-row-reverse' : ''}`}>
          <PlayerStatusCard player={currentPlayer} stats={run.stats} active showLives compact />
          {dockOnTop && <DockHome />}
          <span className="inline-flex items-center gap-2">
            <span className="inline-flex items-center gap-1 font-semibold"><Icon name="bombMine" size={12} /> {countRemainingMines(run.board)} left</span>
            {/* Ending the run lives beside Pause rather than in a full-width bar
                under the board — that bar cost a row of board on every screen,
                and most of a phone's height in landscape. */}
            {!holding && (
              <HudIconButton icon="endRun" label="Give up run" danger onClick={() => setConfirmGiveUp(true)} />
            )}
            <PauseButton onPause={() => setPaused(true)} />
          </span>
        </div>
        <div className="relative min-h-0 flex-1">
          <BoardView
            board={run.board}
            players={players}
            activePlayerId={currentPlayer.id}
            actionMode={actionMode}
            oneFingerScroll={oneFingerScroll}
            disabled={paused || holding}
            tileSizePref={tileSizePref}
            overlay={buildDock(raceState.currentIndex)}
            onAction={handleAction}
          />
        </div>
        {!dockOnTop && <DockHome className="w-full" />}
        {paused && <PauseMenu onClose={() => setPaused(false)} />}
        {confirmGiveUp && (
          <ConfirmDialog
            title="Give up this run?"
            confirmLabel="Give up"
            danger
            onCancel={() => setConfirmGiveUp(false)}
            onConfirm={() => {
              setConfirmGiveUp(false);
              giveUpRace();
            }}
          />
        )}
      </div>
    );
  }

  if (mode === 'coop') {
    const coop = match as CoopState;
    const active = players[coop.activePlayerIndex];
    const pendingSelection = coop.pendingPeek && coop.pendingPeek.position.x === -1;
    const peekResolved = coop.pendingPeek && coop.pendingPeek.position.x !== -1;

    if (seatedVariant) {
      return (
        <>
          <div aria-live="polite" className="sr-only">
            {announce}
          </div>
          <SeatedBoard
            variant={seatedVariant}
            seats={seats}
            players={players}
            board={coop.board}
            stats={coop.stats}
            activePlayerIndex={coop.activePlayerIndex}
            showLives
            minesLeft={countRemainingMines(coop.board)}
            onPause={() => setPaused(true)}
            actionMode={actionMode}
            oneFingerScroll={oneFingerScroll}
            onAction={handleAction}
            overlay={buildDock(coop.activePlayerIndex)}
            disabled={paused || holding || turnTransition.active || Boolean(peekResolved)}
            tileSizePref={tileSizePref}
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
          </SeatedBoard>
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
      <div className="flex h-full flex-col gap-2 p-2 sm:gap-3 sm:p-3">
        <div aria-live="polite" className="sr-only">
          {announce}
        </div>
        <PlayerRail
          players={players}
          activeId={active.id}
          reverse={settings.leftHanded}
          renderPlayer={(p) => (
            <PlayerStatusCard player={p} stats={coop.stats[p.id]} active={p.id === active.id} showLives compact />
          )}
        />
        {/* Game-info strip: a single scrollable line so it never grows tall
            enough to push the board down or require scrolling to reach. */}
        <InfoStrip reverse={settings.leftHanded} home={dockOnTop} trailing={<PauseButton onPause={() => setPaused(true)} />}>
          <span className="shrink-0 font-semibold">🏆 {coop.teamScore}</span>
          <span className="inline-flex shrink-0 items-center gap-1 font-semibold">
            <Icon name="bombMine" size={12} /> {countRemainingMines(coop.board)} left
          </span>
          {settings.coopTeamTimerSeconds > 0 && (
            <div className="w-28 shrink-0">
              <TurnTimer
                seconds={settings.coopTeamTimerSeconds}
                resetKey="coop-team-timer"
                paused={paused || turnTransition.active}
                onExpire={expireTimer}
              />
            </div>
          )}
        </InfoStrip>
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
            oneFingerScroll={oneFingerScroll}
            disabled={paused || holding || turnTransition.active || Boolean(peekResolved)}
            tileSizePref={tileSizePref}
            mistakePos={mistakePosFromEvents(lastEvents)}
            peekPosition={coop.pendingPeek && coop.pendingPeek.position.x !== -1 ? coop.pendingPeek.position : null}
            peekSafe={coop.pendingPeek?.safe}
            overlay={buildDock(coop.activePlayerIndex)}
            onAction={handleAction}
          />
          {turnTransition.active && <TurnTransitionOverlay player={players.find((p) => p.name === turnTransition.playerName)} />}
        </div>
        {!dockOnTop && <DockHome className="w-full" />}
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
  // Flags needed to win — meaningful for majority / first-to targets only;
  // complete-board has no fixed winning count, so pills show a plain score.
  const duelScoreTarget = duel.settings.duelTarget.type === 'complete-board' ? null : duelTargetCount(duel);

  if (seatedVariant) {
    return (
      <>
        <div aria-live="polite" className="sr-only">
          {announce}
        </div>
        <SeatedBoard
          variant={seatedVariant}
          seats={seats}
          players={players}
          board={duel.board}
          stats={duel.stats}
          activePlayerIndex={duel.activePlayerIndex}
          showLives={duelHasLives(duel.settings)}
          minesLeft={countRemainingMines(duel.board)}
          onPause={() => setPaused(true)}
          scoreTarget={duelScoreTarget}
          actionMode={actionMode}
          oneFingerScroll={oneFingerScroll}
          onAction={handleAction}
          overlay={buildDock(duel.activePlayerIndex)}
          disabled={paused || holding || turnTransition.active}
          tileSizePref={tileSizePref}
          mistakePos={mistakePosFromEvents(lastEvents)}
          timer={
            // Same visibility rule as the side-by-side info strip: Turn by Time
            // always shows the countdown (the timer IS the turn mechanism);
            // Streak shows it only when the optional turn timer is enabled.
            duel.settings.duelVariant === 'turn-by-time' ||
            (duel.settings.duelTimer.enabled && duel.settings.duelVariant === 'streak')
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
        </SeatedBoard>
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
    <div className="flex h-full flex-col gap-2 p-2 sm:gap-3 sm:p-3">
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>
      <PlayerRail
        players={players}
        activeId={active.id}
        reverse={settings.leftHanded}
        renderPlayer={(p) => (
          <PlayerStatusCard
            player={p}
            stats={duel.stats[p.id]}
            active={p.id === active.id}
            showLives={duelHasLives(duel.settings)}
            compact
            scoreTarget={duelScoreTarget}
          />
        )}
      />
      {/* Game-info strip: a single scrollable line so it never grows tall
          enough to push the board down or require scrolling to reach. */}
      <InfoStrip reverse={settings.leftHanded} home={dockOnTop} trailing={<PauseButton onPause={() => setPaused(true)} />}>
        <span className="inline-flex shrink-0 items-center gap-1 font-semibold">
          <Icon name="bombMine" size={12} /> {countRemainingMines(duel.board)} left
        </span>
        {duel.settings.duelVariant === 'turn-by-moves' && (
          <span className="inline-flex shrink-0 items-center gap-1 font-semibold">
            {duel.settings.duelMaxActionsPerTurn - duel.turnActionsCount} moves left
          </span>
        )}
        {(duel.settings.duelVariant === 'turn-by-time' || (duel.settings.duelTimer.enabled && duel.settings.duelVariant === 'streak')) && (
          <div className="w-24 shrink-0 sm:w-28">
            <TurnTimer
              // Turn by Time: timer always shown as it IS the turn duration mechanism.
              // Streak: timer shown only if explicitly enabled.
              seconds={duel.settings.duelTimer.seconds}
              resetKey={`${duel.activePlayerIndex}-${duel.turnActionsCount}`}
              paused={paused || turnTransition.active}
              onExpire={expireTimer}
            />
          </div>
        )}
      </InfoStrip>
      <div className="relative min-h-0 flex-1">
        <BoardView
          board={duel.board}
          players={players}
          activePlayerId={active.id}
          actionMode={actionMode}
          oneFingerScroll={oneFingerScroll}
          disabled={paused || holding || turnTransition.active}
          tileSizePref={tileSizePref}
          mistakePos={mistakePosFromEvents(lastEvents)}
          overlay={buildDock(duel.activePlayerIndex)}
          onAction={handleAction}
        />
        {turnTransition.active && <TurnTransitionOverlay player={players.find((p) => p.name === turnTransition.playerName)} />}
      </div>
      {!dockOnTop && <DockHome className="w-full" />}
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

/**
 * The slot the control dock parks in by default. It is deliberately an empty
 * flex child of a bar the screen already draws: the controls then cost no
 * board height at all, which is what makes the game playable on a phone held
 * horizontally. ControlDock finds it by this attribute and portals into it.
 */
function DockHome({ className = '' }: { className?: string }) {
  return <div data-dock-home className={`flex shrink-0 items-center justify-center ${className}`} />;
}

/**
 * The game-info bar above the board: stats on one side, the dock home in the
 * middle, controls on the other. Only the stats scroll — the dock home must
 * not sit inside an overflow container, or dragging the cluster out of it onto
 * the board would clip it mid-gesture.
 */
function InfoStrip({
  children,
  trailing,
  reverse,
  home,
}: {
  children: ReactNode;
  trailing?: ReactNode;
  reverse?: boolean;
  /** Host the control bar's home in the middle of this row (landscape only —
   *  upright, the row is too narrow to share and the bar lives under the
   *  board instead). */
  home?: boolean;
}) {
  return (
    <div className={`flex shrink-0 items-center gap-2 ${reverse ? 'flex-row-reverse' : ''}`}>
      <div
        className={`flex min-w-0 flex-1 basis-0 items-center gap-2 overflow-x-auto whitespace-nowrap pb-0.5 text-xs sm:gap-3 sm:text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          reverse ? 'flex-row-reverse' : ''
        }`}
      >
        {children}
      </div>
      {home && <DockHome />}
      <div className={`flex ${home ? 'flex-1 basis-0' : ''} items-center gap-2 ${reverse ? 'justify-start' : 'justify-end'}`}>
        {trailing}
      </div>
    </div>
  );
}

function ConfirmReveal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <ConfirmDialog title="Reveal this tile?" confirmLabel="Reveal" onCancel={onCancel} onConfirm={onConfirm} />
  );
}
