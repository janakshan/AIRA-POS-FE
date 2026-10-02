import { Button } from '@rbp/ui';
import { ArrowLeftIcon, ChefHatIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router';
import { useAccess } from '@/features/auth/hooks/use-access';
import { LocationSwitcher } from './components/location-switcher';
import { OfflineNotice, SkipLink } from './components/a11y';
import { UserMenu } from './components/user-menu';

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className="font-mono text-base whitespace-nowrap tabular-nums sm:text-lg">
      {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

/** Kitchen display layout: always dark, high contrast, large type. */
export function KitchenLayout() {
  const { t } = useTranslation();
  const { can } = useAccess();
  return (
    <div className="dark flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <SkipLink />
      <OfflineNotice />
      <header className="flex h-touch-pos shrink-0 items-center gap-3 border-b px-3">
        {can('dashboard.view') ? (
          <Button variant="ghost" size="icon" asChild aria-label={t('actions.back')}>
            <Link to="/">
              <ArrowLeftIcon />
            </Link>
          </Button>
        ) : (
          <ChefHatIcon className="ml-2 size-6 text-primary" />
        )}
        <LocationSwitcher className="min-w-0 shrink" />
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <Clock />
          <UserMenu />
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-auto p-3 outline-none sm:p-4"
      >
        <Outlet />
      </main>
    </div>
  );
}
