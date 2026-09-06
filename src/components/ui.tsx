import { useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './icons';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const base =
    'focus-ring inline-flex items-center justify-center gap-2 rounded-[var(--md-radius-md)] px-4 py-2.5 text-sm font-semibold transition-[transform,box-shadow,background-color] duration-150 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none';
  const variants: Record<string, string> = {
    primary:
      'md-accent-gradient text-[var(--md-accent-contrast)] shadow-[var(--md-shadow-sm)] hover:shadow-[var(--md-shadow-md)]',
    secondary:
      'bg-[var(--md-surface-2)] text-[var(--md-text)] border border-[var(--md-border)] hover:border-[var(--md-accent)]',
    ghost: 'bg-transparent text-[var(--md-text)] hover:bg-[var(--md-surface-2)]',
    danger: 'bg-[var(--md-danger)] text-white shadow-[var(--md-shadow-sm)] hover:shadow-[var(--md-shadow-md)]',
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Card({
  children,
  className = '',
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={`md-card rounded-[var(--md-radius-lg)] border border-[var(--md-border)] bg-[var(--md-surface)] ${
        interactive ? 'md-card-interactive' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  columns,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; disabled?: boolean; title?: string }[];
  ariaLabel: string;
  /** When set, lay the options out as a grid of N equal columns (wraps to fit
   *  narrow screens) instead of a single overflowing inline row. */
  columns?: number;
}) {
  const grid = columns != null;
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`rounded-[var(--md-radius-md)] border border-[var(--md-border)] bg-[var(--md-surface-2)] p-1 ${
        grid ? 'grid gap-1 min-w-min' : 'inline-flex'
      }`}
      style={grid ? { gridTemplateColumns: `repeat(${columns}, minmax(100px, 1fr))` } : undefined}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          disabled={opt.disabled}
          title={opt.title}
          onClick={() => !opt.disabled && onChange(opt.value)}
          className={`focus-ring rounded-[var(--md-radius-sm)] py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            grid ? 'w-full px-2' : 'px-4'
          } ${
            value === opt.value
              ? 'bg-[var(--md-accent)] text-[var(--md-accent-contrast)]'
              : 'text-[var(--md-text-muted)] hover:text-[var(--md-text)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-[var(--md-text-muted)]">{description}</span>}
      </span>
      <span className="relative inline-flex shrink-0 items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className="h-6 w-11 rounded-full bg-[var(--md-border)] transition-colors peer-checked:bg-[var(--md-accent)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--md-accent)]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-5"
        />
      </span>
    </label>
  );
}

export function NumberField({
  value,
  onChange,
  min,
  max,
  label,
  id,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  label: string;
  id: string;
}) {
  // While the field is being edited, it shows a local draft string instead of
  // the parent's number. Without this, the controlled input snaps back to the
  // old value the moment the user clears it — the "sticky 0 you can't delete".
  const [draft, setDraft] = useState<string | null>(null);

  const commitDraft = () => {
    if (draft !== null && draft.trim() !== '') {
      const num = Number(draft);
      if (!Number.isNaN(num)) onChange(Math.min(max, Math.max(min, num)));
    }
    setDraft(null);
  };

  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={draft ?? String(value)}
        onChange={(e) => {
          const input = e.target.value;
          setDraft(input);
          // Propagate in-range values live so dependent UI (e.g. the mine cap
          // hint) tracks typing; out-of-range drafts wait for blur to clamp.
          const num = Number(input);
          if (input.trim() !== '' && !Number.isNaN(num) && num >= min && num <= max) {
            onChange(num);
          }
        }}
        // Select on focus so typing replaces the value instead of appending to
        // it — with a two-digit cap, "3" + "5" silently becoming 35 is worse
        // than the tap-then-type-a-number flow people expect from these fields.
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitDraft();
        }}
        className="focus-ring rounded-[var(--md-radius-sm)] border border-[var(--md-border)] bg-[var(--md-surface)] px-3 py-2 text-[var(--md-text)]"
      />
    </label>
  );
}

/**
 * A round icon control for the in-match HUD strip. Pause used to ride along
 * inside the movable control dock over the board; it and its neighbours now
 * live next to the mine counter, which frees dock space for the one-hand
 * controls and keeps destructive-ish actions away from the playing finger.
 */
export function HudIconButton({
  icon,
  label,
  onClick,
  danger = false,
  className = '',
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  /** Tints the control red — for actions that end the run/match. */
  danger?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`focus-ring inline-flex shrink-0 items-center justify-center rounded-full transition-colors ${className}`}
      style={{
        minHeight: 32,
        minWidth: 32,
        background: danger ? 'color-mix(in srgb, var(--md-danger) 18%, transparent)' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${danger ? 'color-mix(in srgb, var(--md-danger) 55%, transparent)' : 'var(--md-border)'}`,
        color: danger ? 'var(--md-danger)' : 'var(--md-neon-text)',
      }}
    >
      <Icon name={icon} size={14} />
    </button>
  );
}

export function PauseButton({ onPause, className = '' }: { onPause: () => void; className?: string }) {
  return <HudIconButton icon="pause" label="Pause" onClick={onPause} className={className} />;
}

/** Small yes/no modal for an action that cannot be taken back. */
export function ConfirmDialog({
  title,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xs rounded-[var(--md-radius-lg)] border border-[var(--md-border)] bg-[var(--md-surface)] p-5 text-center">
        <p className="font-semibold">{title}</p>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} className="flex-1" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
