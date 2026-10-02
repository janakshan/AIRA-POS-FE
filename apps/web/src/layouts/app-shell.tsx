import { Button, ScrollArea, Separator, Sheet, SheetContent, SheetTitle } from '@rbp/ui';
import { cn } from '@rbp/utils';
import { MenuIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router';
import { useMe } from '@/features/auth/api/queries';
import { useIsDesktop } from '@/lib/use-media-query';
import { useUiStore } from '@/stores/ui-store';
import { LanguageMenu } from './components/language-menu';
import { LocationSwitcher } from './components/location-switcher';
import { OperatorChip } from './components/operator-chip';
import { SidebarNav } from './components/sidebar-nav';
import { ThemeMenu } from './components/theme-menu';
import { OfflineNotice, SkipLink } from './components/a11y';
import { UserMenu } from './components/user-menu';

function Brand({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { data: me } = useMe();
  return (
    <Link
      to="/"
      className="flex h-16 shrink-0 items-center gap-2.5 px-4 text-sidebar-accent-foreground"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
        {me?.tenant.branding.logoText ?? 'R'}
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{me?.tenant.name}</span>
          <span className="block text-[11px] text-sidebar-muted">{t('appName')}</span>
        </span>
      )}
    </Link>
  );
}

/**
 * Admin shell. Desktop ≥1280: collapsible sidebar. Tablet 768–1279: icon rail.
 * Mobile <768: drawer.
 */
export function AppShell() {
  const { t } = useTranslation();
  const isDesktop = useIsDesktop();
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const [mobileOpen, setMobileOpen] = useState(false);
  const rail = !isDesktop || sidebarCollapsed;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <SkipLink />
      <OfflineNotice />
      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            'hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex',
            rail ? 'w-[4.5rem]' : 'w-64',
          )}
        >
          <Brand compact={rail} />
          <Separator className="bg-sidebar-border" />
          <ScrollArea className="flex-1">
            <SidebarNav collapsed={rail} />
          </ScrollArea>
          {isDesktop && (
            <div
              className={cn('border-t border-sidebar-border p-3', rail && 'flex justify-center')}
            >
              <Button
                variant="ghost"
                size={rail ? 'icon' : 'sm'}
                onClick={toggleSidebar}
                aria-label={rail ? t('shell.expandSidebar') : t('shell.collapseSidebar')}
                className="text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                {rail ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
                {!rail && t('shell.collapseSidebar')}
              </Button>
            </div>
          )}
        </aside>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="w-72 gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
            closeLabel={t('actions.close')}
          >
            <SheetTitle className="sr-only">{t('shell.openMenu')}</SheetTitle>
            <Brand />
            <Separator className="bg-sidebar-border" />
            <ScrollArea className="flex-1">
              <SidebarNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </ScrollArea>
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b bg-card/80 px-3 backdrop-blur md:px-5">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label={t('shell.openMenu')}
            >
              <MenuIcon />
            </Button>
            <LocationSwitcher className="min-w-0" />
            <div className="ml-auto flex items-center gap-1">
              <OperatorChip />
              <div className="hidden items-center sm:flex">
                <LanguageMenu />
                <ThemeMenu />
              </div>
              <UserMenu />
            </div>
          </header>
          <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto outline-none">
            <div className="mx-auto w-full max-w-[1400px] p-page">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
