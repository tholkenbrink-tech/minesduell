import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const base =
    'focus-ring inline-flex items-center justify-center gap-2 rounded-[var(--md-radius-md)] px-4 py-2.5 text-sm font-semibold transition-transform active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none';
  const variants: Record<string, string> = {
    primary: 'bg-[var(--md-accent)] text-[var(--md-accent-contrast)]',
    secondary: 'bg-[var(--md-surface-2)] text-[var(--md-text)] border border-[var(--md-border)]',
    ghost: 'bg-transparent text-[var(--md-text)] hover:bg-[var(--md-surface-2)]',
    danger: 'bg-[var(--md-danger)] text-white',
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[var(--md-radius-lg)] border border-[var(--md-border)] bg-[var(--md-surface)] ${className}`}
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
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex rounded-[var(--md-radius-md)] border border-[var(--md-border)] bg-[var(--md-surface-2)] p-1"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`focus-ring rounded-[var(--md-radius-sm)] px-4 py-2 text-sm font-semibold transition-colors ${
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
          style={{ transform: checked ? 'translateX(1.25rem)' : undefined }}
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
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="focus-ring rounded-[var(--md-radius-sm)] border border-[var(--md-border)] bg-[var(--md-surface)] px-3 py-2 text-[var(--md-text)]"
      />
    </label>
  );
}
