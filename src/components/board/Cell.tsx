import { memo } from 'react';
import type { Cell as CellType, Player } from '../../engine/types';
import { Icon } from '../icons';

const NUMBER_COLOR_VAR = ['', 'var(--md-num-1)', 'var(--md-num-2)', 'var(--md-num-3)', 'var(--md-num-4)', 'var(--md-num-5)', 'var(--md-num-6)', 'var(--md-num-7)', 'var(--md-num-8)'];

const THEME_VAR: Record<Player['theme'], string> = {
  coral: 'var(--md-player-coral)',
  teal: 'var(--md-player-teal)',
  violet: 'var(--md-player-violet)',
  amber: 'var(--md-player-amber)',
};

interface CellProps {
  cell: CellType;
  size: number;
  players: Player[];
  activePlayerId?: string;
  /** Rotation of the cell's inner content (never the cell/grid) toward the
   *  active player's seat: 0 (bottom) · 90 (right) · 180 (top) · 270 (left). */
  orientationDeg: 0 | 90 | 180 | 270;
  focused?: boolean;
  isPeek?: boolean;
  peekSafe?: boolean;
  /** Briefly shake this tile — set when it's the tile of the latest mistake. */
  shake?: boolean;
}

function CellImpl({ cell, size, players, orientationDeg, focused, isPeek, peekSafe, shake }: CellProps) {
  // Attribution ownership: a flag is owned by whoever placed it; a revealed
  // mine by whoever detonated it. The ring says right/wrong, the dot says who.
  const ownerId = cell.flagged ? cell.flaggedBy : cell.revealed && cell.mine ? cell.revealedBy : undefined;
  const owner = ownerId ? players.find((p) => p.id === ownerId) : undefined;

  let tileClass = 'md-tile-hidden';
  let ringClass = '';
  let content: React.ReactNode = null;

  if (cell.revealed) {
    if (cell.mine) {
      tileClass = 'md-tile-mine';
      ringClass = 'md-tile-ring-wrong';
      content = <span aria-hidden>💥</span>;
    } else {
      tileClass = 'md-tile-revealed';
      if (cell.adjacent > 0) {
        content = (
          <span
            aria-hidden
            className="md-display"
            style={{
              color: NUMBER_COLOR_VAR[cell.adjacent],
              fontWeight: 700,
              textShadow: `0 0 8px color-mix(in srgb, ${NUMBER_COLOR_VAR[cell.adjacent]} 60%, transparent)`,
            }}
          >
            {cell.adjacent}
          </span>
        );
      }
    }
  } else if (cell.flagged) {
    // A committed flag is a confirmed, immutable bomb — settled 💣 look. A
    // fresh (uncommitted) flag keeps the transient 🚩 mark.
    tileClass = cell.committed ? 'md-tile-flag md-tile-flag-committed' : 'md-tile-flag';
    // Correct flag (over a real mine) rings green; a misflag rings red. A
    // committed flag carries its own steady edge instead of the glow ring.
    ringClass = cell.committed ? '' : cell.mine ? 'md-tile-ring-correct' : 'md-tile-ring-wrong';
    content = <Icon name={cell.committed ? 'bombMine' : 'flag'} size={16} />;
  } else if (isPeek) {
    tileClass = peekSafe ? 'md-tile-revealed' : 'md-tile-peek-danger';
    content = <span aria-hidden>{peekSafe ? '·' : '!'}</span>;
  }

  const label = cell.revealed
    ? cell.mine
      ? 'mine'
      : cell.adjacent > 0
        ? `${cell.adjacent} adjacent mines`
        : 'empty'
    : cell.flagged
      ? cell.committed
        ? 'confirmed mine'
        : 'flagged'
      : 'hidden';

  return (
    <div
      role="gridcell"
      aria-label={label}
      data-focused={focused || undefined}
      className="relative flex select-none items-center justify-center text-sm"
      style={{ width: size, height: size }}
    >
      <div
        className={`md-tile ${tileClass} ${ringClass} ${shake ? 'md-shake' : ''} absolute inset-[1px] flex items-center justify-center`}
        style={
          focused
            ? { outline: '2px solid var(--md-accent)', outlineOffset: -1, zIndex: 1 }
            : undefined
        }
      >
        <span style={{ transform: `rotate(${orientationDeg}deg)`, display: 'inline-flex' }}>{content}</span>
        {owner && (
          <span
            className="md-owner-dot"
            aria-hidden
            style={{
              background: THEME_VAR[owner.theme],
              boxShadow: `0 0 6px ${THEME_VAR[owner.theme]}`,
            }}
          />
        )}
      </div>
    </div>
  );
}

export const Cell = memo(CellImpl);
