import { memo } from 'react';
import type { Cell as CellType, Player } from '../../engine/types';

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
  orientationDeg: 0 | 180;
  focused?: boolean;
  isPeek?: boolean;
  peekSafe?: boolean;
}

function CellImpl({ cell, size, players, orientationDeg, focused, isPeek, peekSafe }: CellProps) {
  const owner = cell.flaggedBy ? players.find((p) => p.id === cell.flaggedBy) : undefined;

  let tileClass = 'md-tile-hidden';
  let content: React.ReactNode = null;

  if (cell.revealed) {
    if (cell.mine) {
      tileClass = 'md-tile-mine';
      content = <span aria-hidden>💣</span>;
    } else {
      tileClass = 'md-tile-revealed';
      if (cell.adjacent > 0) {
        content = (
          <span aria-hidden style={{ color: NUMBER_COLOR_VAR[cell.adjacent], fontWeight: 800 }}>
            {cell.adjacent}
          </span>
        );
      }
    }
  } else if (cell.flagged) {
    tileClass = 'md-tile-flag';
    content = (
      <span className="relative flex items-center justify-center" aria-hidden>
        <span>🚩</span>
        {owner && (
          <span
            className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full text-[7px] font-bold text-white ring-1 ring-white/60"
            style={{ background: THEME_VAR[owner.theme] }}
          >
            {owner.name.charAt(0).toUpperCase()}
          </span>
        )}
      </span>
    );
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
      ? 'flagged'
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
        className={`md-tile ${tileClass} absolute inset-[1px] flex items-center justify-center`}
        style={
          focused
            ? { outline: '2px solid var(--md-accent)', outlineOffset: -1, zIndex: 1 }
            : undefined
        }
      >
        <span style={{ transform: `rotate(${orientationDeg}deg)`, display: 'inline-flex' }}>{content}</span>
      </div>
    </div>
  );
}

export const Cell = memo(CellImpl);
