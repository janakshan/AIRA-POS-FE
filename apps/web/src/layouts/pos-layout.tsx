import { Button } from '@rbp/ui';
import { ArrowLeftIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router';
import { useMe } from '@/features/auth/api/queries';
import { LocationSwitcher } from './components/location-switcher';
import { OperatorChip } from './components/operator-chip';
import { OfflineNotice, SkipLink } from './components/a11y';
import { UserMenu } from './components/user-menu';

/** Full-screen, touch-first layout for POS terminals and waiter tablets. */
export function PosLayout() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-muted/40">
      <SkipLink />
      <OfflineNotice />
      <header className="flex h-touch-pos shrink-0 items-center gap-2 border-b bg-card px-2 sm:px-3">
        <Button variant="ghost" size="icon" asChild aria-label={t('actions.back')}>
          <Link to="/">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <LocationSwitcher />
        {me?.device && (
          <span className="hidden rounded bg-muted px-2 py-1 text-xs text-muted-foreground lg:inline">
            {t('shell.device')}: {me.device.name}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <OperatorChip />
          <UserMenu />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="min-h-0 flex-1 outline-none">
        <Outlet />
      </main>
    </div>
  );
}
