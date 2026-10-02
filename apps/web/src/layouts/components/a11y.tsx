import { OfflineBanner } from '@rbp/ui';
import { useTranslation } from 'react-i18next';

/** First focusable element: jumps keyboard users past navigation. */
export function SkipLink() {
  const { t } = useTranslation();
  return (
    <a
      href="#main"
      className="sr-only z-toast rounded-md bg-primary px-4 py-2 text-primary-foreground focus-ring focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
    >
      {t('shell.skipToContent')}
    </a>
  );
}

export function OfflineNotice() {
  const { t } = useTranslation();
  return <OfflineBanner label={t('shell.offline')} />;
}
