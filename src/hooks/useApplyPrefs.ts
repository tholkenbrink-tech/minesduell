import { useEffect } from 'react';
import { usePrefsStore, resolveEffectiveTheme } from '../store/usePrefsStore';

/** Syncs user preferences onto <html> as data-attributes so plain CSS can react to them. */
export function useApplyPrefs() {
  const theme = usePrefsStore((s) => s.theme);
  const reducedMotion = usePrefsStore((s) => s.reducedMotion);
  const highContrast = usePrefsStore((s) => s.highContrast);
  const textSize = usePrefsStore((s) => s.textSize);

  useEffect(() => {
    const root = document.documentElement;
    const effective = resolveEffectiveTheme(theme);
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', effective);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-reduced-motion', String(reducedMotion));
  }, [reducedMotion]);

  useEffect(() => {
    document.documentElement.setAttribute('data-high-contrast', String(highContrast));
  }, [highContrast]);

  useEffect(() => {
    document.documentElement.setAttribute('data-text-size', textSize);
  }, [textSize]);
}
