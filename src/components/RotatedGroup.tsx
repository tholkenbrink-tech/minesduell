import type { ReactNode } from 'react';
import type { SeatRotation } from '../engine/arrangement';
import { useRotatedSize } from '../hooks/useRotatedSize';

/** Rotates its children upright for a seat while keeping the reserved layout
 *  footprint correct for 90/270deg rotations — see useRotatedSize. */
export function RotatedGroup({
  rotation,
  className,
  children,
}: {
  rotation: SeatRotation;
  className?: string;
  children: ReactNode;
}) {
  const { contentRef, wrapperStyle, contentStyle } = useRotatedSize(rotation);
  return (
    <div style={wrapperStyle}>
      <div ref={contentRef} style={contentStyle} className={className}>
        {children}
      </div>
    </div>
  );
}
