import { useEffect, useRef, type ReactNode } from 'react';
import type { Player } from '../../engine/types';
import { usePrefsStore } from '../../store/usePrefsStore';

/**
 * A single horizontal, scrollable row of player cards for the shared-device
 * HUD. When the active player's card sits outside the visible area (e.g. a
 * 4-player board on a narrow phone), the rail scrolls it into view so the
 * person whose turn it is is never cut off.
 */
export function PlayerRail({
  players,
  activeId,
  reverse,
  renderPlayer,
}: {
  players: Player[];
  activeId?: string;
  /** Left-handed layout: lay cards out right-to-left. */
  reverse?: boolean;
  renderPlayer: (player: Player) => ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefsStore((s) => s.reducedMotion);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !activeId) return;
    const el = container.querySelector<HTMLElement>(`[data-player-id="${CSS.escape(activeId)}"]`);
    if (!el) return;
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    // Skip when the active card is already fully visible — avoids jitter.
    if (eRect.left >= cRect.left && eRect.right <= cRect.right) return;
    // Compute an ABSOLUTE target scrollLeft (from the current scroll + measured
    // offset) that centers the active card, then scrollTo it. Using an absolute
    // target rather than a relative scrollBy keeps rapid, back-to-back turn
    // changes from racing/under-shooting each other's smooth animations.
    const target =
      container.scrollLeft + (eRect.left - cRect.left) - (container.clientWidth - eRect.width) / 2;
    const max = container.scrollWidth - container.clientWidth;
    container.scrollTo({
      left: Math.max(0, Math.min(max, target)),
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [activeId, reducedMotion]);

  return (
    <div
      ref={containerRef}
      className={`flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        reverse ? 'flex-row-reverse' : ''
      }`}
    >
      {players.map((p) => (
        <div key={p.id} data-player-id={p.id} className="shrink-0">
          {renderPlayer(p)}
        </div>
      ))}
    </div>
  );
}
