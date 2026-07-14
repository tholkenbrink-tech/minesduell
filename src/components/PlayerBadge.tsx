import type { Player } from '../engine/types';

const THEME_VAR: Record<Player['theme'], string> = {
  coral: 'var(--md-player-coral)',
  teal: 'var(--md-player-teal)',
  violet: 'var(--md-player-violet)',
  amber: 'var(--md-player-amber)',
};

const SHAPE_CLIP: Record<Player['shape'], string> = {
  circle: '50%',
  square: '18%',
  diamond: '0%',
  triangle: '0%',
};

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
  const shapeStyle: React.CSSProperties = { width: size, height: size, background: color };

  if (player.shape === 'diamond') {
    shapeStyle.transform = 'rotate(45deg)';
    shapeStyle.borderRadius = '4px';
  } else {
    shapeStyle.borderRadius = SHAPE_CLIP[player.shape];
  }
  if (player.shape === 'triangle') {
    return (
      <div
        role="img"
        aria-label={player.name}
        className={`relative inline-flex items-center justify-center ${active ? 'ring-2 ring-offset-2 ring-[var(--md-accent)]' : ''}`}
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
          <polygon points="50,6 96,94 4,94" fill={color} />
        </svg>
        <span className="absolute text-xs font-bold text-white" style={{ marginTop: size * 0.12 }}>
          {initial}
        </span>
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={player.name}
      className={`inline-flex items-center justify-center text-xs font-bold text-white ${
        active ? 'ring-2 ring-offset-2 ring-[var(--md-accent)]' : ''
      }`}
      style={shapeStyle}
    >
      <span style={player.shape === 'diamond' ? { transform: 'rotate(-45deg)' } : undefined}>{initial}</span>
    </div>
  );
}
