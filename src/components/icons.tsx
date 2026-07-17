import type { SVGProps } from 'react';
import { usePrefsStore } from '../store/usePrefsStore';

export type IconName = 'reveal' | 'flag' | 'pause' | 'diamond' | 'heart' | 'bombMine' | 'modeDuel' | 'modeRace' | 'modeCoop';

const CLASSIC: Record<IconName, string> = {
  reveal: '🔍',
  flag: '🚩',
  pause: '⏸',
  diamond: '💎',
  heart: '❤️',
  bombMine: '💣',
  modeDuel: '⚔️',
  modeRace: '🏁',
  modeCoop: '🤝',
};

function NeonSvg({ name, ...svgProps }: { name: IconName } & SVGProps<SVGSVGElement>) {
  const stroke: SVGProps<SVGSVGElement> = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  switch (name) {
    case 'reveal':
      return (
        <svg {...stroke} {...svgProps}>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <line x1="15.3" y1="15.3" x2="21" y2="21" />
        </svg>
      );
    case 'flag':
      return (
        <svg {...stroke} {...svgProps}>
          <line x1="5" y1="3" x2="5" y2="21" />
          <path d="M5 4.5c3-2 6-2 9 0s6 2 9 0v9c-3 2-6 2-9 0s-6-2-9 0z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'pause':
      return (
        <svg {...stroke} {...svgProps}>
          <line x1="8" y1="5" x2="8" y2="19" strokeWidth={3} />
          <line x1="16" y1="5" x2="16" y2="19" strokeWidth={3} />
        </svg>
      );
    case 'diamond':
      return (
        <svg {...stroke} {...svgProps}>
          <path d="M12 3 L20 10 L12 21 L4 10 Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'heart':
      return (
        <svg {...stroke} {...svgProps}>
          <path
            d="M12 20.5 C7 16.5 3 13 3 8.8 C3 5.6 5.5 3.5 8.2 3.5 C10 3.5 11.3 4.4 12 5.7 C12.7 4.4 14 3.5 15.8 3.5 C18.5 3.5 21 5.6 21 8.8 C21 13 17 16.5 12 20.5 Z"
            fill="currentColor"
            stroke="none"
          />
        </svg>
      );
    case 'bombMine':
      return (
        <svg {...stroke} {...svgProps}>
          <circle cx="11" cy="13" r="7" fill="currentColor" stroke="none" />
          <line x1="16" y1="7" x2="19.5" y2="3.5" />
          <line x1="19.5" y1="3.5" x2="17.5" y2="1.5" />
          <line x1="19.5" y1="3.5" x2="21.5" y2="5.5" />
          <circle cx="19.5" cy="3.5" r="1.3" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'modeDuel':
      return (
        <svg {...stroke} {...svgProps}>
          <path d="M5 19L19 5M15 5h4v4M9 19H5v-4" />
        </svg>
      );
    case 'modeRace':
      return (
        <svg {...stroke} {...svgProps}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l3 2" />
        </svg>
      );
    case 'modeCoop':
      return (
        <svg {...stroke} {...svgProps}>
          <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" />
          <path d="M12 8v6M9 11h6" />
        </svg>
      );
  }
}

/**
 * A single icon that switches between the original emoji set ('classic') and
 * a fresher stroke-based neon SVG set ('neon') per the `iconSet` preference
 * (toggled in Game Config settings) — every call site stays a one-liner
 * regardless of which set is active.
 */
export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const iconSet = usePrefsStore((s) => s.iconSet);
  if (iconSet === 'classic') {
    return (
      <span aria-hidden className="inline-block" style={{ fontSize: size, lineHeight: 1 }}>
        {CLASSIC[name]}
      </span>
    );
  }
  return (
    <span aria-hidden className="inline-flex" style={{ width: size, height: size }}>
      <NeonSvg name={name} width={size} height={size} />
    </span>
  );
}
