import { useEffect, useRef, useState } from 'react';

export function TurnTimer({
  seconds,
  resetKey,
  paused,
  onExpire,
  variant = 'default',
  silent = false,
}: {
  seconds: number;
  resetKey: string | number;
  paused?: boolean;
  onExpire: () => void;
  /** 'neon' renders a full-width thin gradient bar (no seconds text). */
  variant?: 'default' | 'neon';
  /** Count down visually but never fire onExpire — for a mirrored second copy. */
  silent?: boolean;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const expiredRef = useRef(false);

  useEffect(() => {
    setRemaining(seconds);
    expiredRef.current = false;
  }, [resetKey, seconds]);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [paused]);

  // Fire onExpire from an effect (after commit), not from inside the setRemaining
  // updater — calling a store action mid-render triggers a setState-in-render
  // warning and can drop the update.
  useEffect(() => {
    if (remaining === 0 && !expiredRef.current) {
      expiredRef.current = true;
      if (!silent) onExpire();
    }
  }, [remaining, silent, onExpire]);

  const pct = Math.max(0, Math.min(100, (remaining / seconds) * 100));
  const low = remaining <= 3;

  if (variant === 'neon') {
    return (
      <div
        className="h-[5px] w-full overflow-hidden rounded-full"
        style={{ background: 'rgba(255,255,255,0.08)' }}
        role="timer"
        aria-live="off"
      >
        <div
          className="h-full rounded-full transition-[width]"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg, var(--md-neon-cyan), var(--md-neon-pink))',
            boxShadow: '0 0 6px color-mix(in srgb, var(--md-neon-pink) 60%, transparent)',
          }}
        />
      </div>
    );
  }

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
