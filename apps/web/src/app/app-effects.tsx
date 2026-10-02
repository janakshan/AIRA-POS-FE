import { useEffect } from 'react';
import { useMe } from '@/features/auth/api/queries';
import { useMediaQuery } from '@/lib/use-media-query';
import { useUiStore } from '@/stores/ui-store';
import i18n from './i18n';

/** Applies theme, tenant branding and language to the document. Renders nothing. */
export function AppEffects() {
  const theme = useUiStore((s) => s.theme);
  const language = useUiStore((s) => s.language);
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const { data: me } = useMe();

  useEffect(() => {
    const dark = theme === 'dark' || (theme === 'system' && prefersDark);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  }, [theme, prefersDark]);

  // Tenant branding: override the primary token (configuration, not tenant-specific code).
  const primary = me?.tenant.branding.primaryColor;
  useEffect(() => {
    const root = document.documentElement;
    if (primary) {
      root.style.setProperty('--primary', primary);
    } else {
      root.style.removeProperty('--primary');
    }
  }, [primary]);

  // Language: user choice → tenant default → English. (Location/device overrides come later.)
  const effectiveLanguage = language ?? me?.tenant.defaultLanguage ?? 'en';
  useEffect(() => {
    if (i18n.language !== effectiveLanguage) void i18n.changeLanguage(effectiveLanguage);
    document.documentElement.lang = effectiveLanguage;
  }, [effectiveLanguage]);

  return null;
}
