import { useEffect, useState } from 'react';

/**
 * Subscribes to a CSS media query and re-renders on change. SSR/test-safe:
 * returns `false` when matchMedia is unavailable.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/**
 * True at tablet-and-up widths. The face-to-face board uses this to pick the
 * roomier layout (persistent event log + segmented action control) over the
 * phone layout (transient seam chip + icon action buttons).
 */
export function useIsWide(): boolean {
  return useMediaQuery('(min-width: 768px)');
}
