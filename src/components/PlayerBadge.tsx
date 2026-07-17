import type { Player } from '../engine/types';

const THEME_VAR: Record<Player['theme'], string> = {
  coral: 'var(--md-player-coral)',
  teal: 'var(--md-player-teal)',
  violet: 'var(--md-player-violet)',
  amber: 'var(--md-player-amber)',
};

// Triangle/square/diamond are inset within the size×size layout box rather
// than filling it edge to edge like the circle does — otherwise they read as
// visibly larger than the circle badge in the same pill (a shape with square
// corners occupies more of its box than a circle does), and a diamond drawn
// at the full box size then rotated 45° would bleed past the box entirely
// (its diagonal is box-size × √2). 0.7 keeps every shape's rotated/unrotated
// footprint at or under the box the circle uses, so all four read as the
// same size.
const SHAPE_INSET = 0.7;

export function PlayerBadge({
  player,
  size = 36,
  active = false,
}: {
  player: Player;
  size?: number;
  active?: boolean;
}) {
  const color = THEME_VAR[player.theme];
  const initial = (player.icon || player.name || '?').trim().charAt(0).toUpperCase();
  const ring = active ? 'ring-2 ring-offset-2 ring-[var(--md-accent)]' : '';

  if (player.shape === 'circle') {
    return (
      <div
        role="img"
        aria-label={player.name}
        className={`inline-flex shrink-0 items-center justify-center text-xs font-bold text-white ${ring}`}
        style={{ width: size, height: size, background: color, borderRadius: '50%' }}
      >
        <span>{initial}</span>
      </div>
    );
  }

  const inner = size * SHAPE_INSET;
  let shape: React.ReactNode;
  if (player.shape === 'triangle') {
    shape = (
      <svg viewBox="0 0 100 100" width={inner} height={inner} aria-hidden>
        <polygon points="50,6 96,94 4,94" fill={color} />
      </svg>
    );
  } else if (player.shape === 'diamond') {
    shape = <div style={{ width: inner, height: inner, background: color, borderRadius: '4px', transform: 'rotate(45deg)' }} />;
  } else {
    shape = <div style={{ width: inner, height: inner, background: color, borderRadius: '18%' }} />;
  }

  return (
    <div
      role="img"
      aria-label={player.name}
      className={`relative inline-flex shrink-0 items-center justify-center ${ring}`}
      style={{ width: size, height: size }}
    >
      {shape}
      <span className="absolute text-xs font-bold text-white">{initial}</span>
    </div>
  );
}
