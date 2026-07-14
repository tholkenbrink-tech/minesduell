import { useEffect, useRef, useState } from 'react';

export function TurnTimer({
  seconds,
  resetKey,
  paused,
  onExpire,
}: {
  seconds: number;
  resetKey: string | number;
  paused?: boolean;
  onExpire: () => void;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const expiredRef = useRef(false);

  useEffect(() => {
    setRemaining(seconds);
    expiredRef.current = false;
  }, [resetKey, seconds]);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          if (!expiredRef.current) {
            expiredRef.current = true;
            onExpire();
          }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [paused, onExpire]);

  const pct = Math.max(0, Math.min(100, (remaining / seconds) * 100));
  const low = remaining <= 3;

  return (
    <div className="flex items-center gap-2" role="timer" aria-live="off">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-[var(--md-surface-2)]">
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${pct}%`, background: low ? 'var(--md-danger)' : 'var(--md-accent)' }}
        />
      </div>
      <span className={`text-sm font-bold tabular-nums ${low ? 'text-[var(--md-danger)]' : ''}`}>{remaining}s</span>
    </div>
  );
}
