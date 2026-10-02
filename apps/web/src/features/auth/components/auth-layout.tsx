import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageMenu } from '@/layouts/components/language-menu';
import { ThemeMenu } from '@/layouts/components/theme-menu';

export function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation('auth');
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,560px)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3 text-lg font-semibold text-sidebar-accent-foreground">
          <img src="/icon.svg" alt="" className="size-9" />
          {t('common:appName')}
        </div>
        <div className="max-w-md space-y-4">
          <p className="text-3xl leading-tight font-semibold text-sidebar-accent-foreground">
            {t('login.tagline')}
          </p>
          <p className="text-sm text-sidebar-muted">
            Retail · Restaurant · KOT · Bakery · Wholesale · Inventory · Staff
          </p>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full bg-primary/30 blur-3xl"
        />
      </aside>
      <main className="flex flex-col">
        <div className="flex justify-end gap-1 p-4">
          <LanguageMenu />
          <ThemeMenu />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-12">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </main>
    </div>
  );
}
