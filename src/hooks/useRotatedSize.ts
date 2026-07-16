import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { SeatRotation } from '../engine/arrangement';

/**
 * CSS `transform: rotate()` never changes an element's layout box — only its
 * paint. Rotating a non-square box by 90/270deg therefore visually swaps its
 * width/height while any *positioning* wrapper around it (flex shrink-to-fit,
 * absolute inset, etc.) keeps measuring the pre-rotation box, causing the
 * rotated content to drift off its intended anchor or clip past it.
 *
 * This hook measures the wrapped content's natural (unrotated) size and
 * returns a `wrapperStyle` (explicit width/height, swapped for 90/270deg) to
 * put on the positioning ancestor, plus a `contentRef`/`contentStyle` that
 * centers the rotated content inside that correctly-sized wrapper. Mirrors
 * the ResizeObserver pattern already used for board centering in BoardView.
 */
export function useRotatedSize(rotation: SeatRotation): {
  contentRef: RefObject<HTMLDivElement | null>;
  wrapperStyle: CSSProperties;
  contentStyle: CSSProperties;
} {
  const contentRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  // Dedup against the previous value (same-reference bailout) — without this,
  // a same-size measurement would still construct a new object each render,
  // which React treats as a change and re-renders forever.
  function setSizeIfChanged(next: { width: number; height: number }) {
    setSize((prev) => (prev && prev.width === next.width && prev.height === next.height ? prev : next));
  }

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setSizeIfChanged({ width: rect.width, height: rect.height });
    }
  });

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width === 0 || height === 0) return;
      setSizeIfChanged({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const swapped = rotation === 90 || rotation === 270;
  const wrapperStyle: CSSProperties = size
    ? { position: 'relative', width: swapped ? size.height : size.width, height: swapped ? size.width : size.height }
    : { position: 'relative' };

  const contentStyle: CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
  };

  return { contentRef, wrapperStyle, contentStyle };
}
