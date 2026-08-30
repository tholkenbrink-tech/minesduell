import { Component, type ErrorInfo, type ReactNode } from 'react';
import { removeKey, STORAGE_KEYS } from '../engine/persistence';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last-resort guard around the whole app. React unmounts the entire tree when
 * a render or event handler throws, which on a phone reads as "the game
 * crashed" — a black/blank screen with no way back. This catches that, keeps
 * the message on screen (so an in-the-wild crash can actually be reported),
 * and offers a reload plus a "discard the saved match" escape hatch for the
 * case where a corrupt in-progress match would otherwise crash on every
 * launch.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the full component stack in the console for on-device debugging
    // (Safari Web Inspector / chrome://inspect) — the panel only shows the message.
    console.error('MinesDuell crashed:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="md-display text-2xl font-bold">Something went wrong</h1>
        <p className="max-w-md text-sm text-[var(--md-text-muted)]">
          The game hit an unexpected error and had to stop. Reloading usually fixes it.
        </p>
        <pre
          data-selectable="true"
          className="max-h-40 max-w-full overflow-auto rounded-[var(--md-radius-md)] border p-3 text-left text-xs"
          style={{ borderColor: 'var(--md-border)', background: 'var(--md-surface-2)' }}
        >
          {error.message || String(error)}
        </pre>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            className="focus-ring rounded-full px-5 py-3"
            style={{ background: 'var(--md-accent)', color: 'var(--md-accent-contrast)', minHeight: 44 }}
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
          <button
            type="button"
            className="focus-ring rounded-full border px-5 py-3"
            style={{ borderColor: 'var(--md-border)', minHeight: 44 }}
            onClick={() => {
              removeKey(STORAGE_KEYS.activeMatch);
              window.location.reload();
            }}
          >
            Discard saved match &amp; reload
          </button>
        </div>
      </div>
    );
  }
}
