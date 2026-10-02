import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageMenu } from '@/layouts/components/language-menu';
import { ThemeMenu } from '@/layouts/components/theme-menu';

const MODULES = ['Retail', 'Restaurant', 'KOT', 'Bakery', 'Wholesale', 'Inventory', 'Staff'];

export function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation('auth');
  return (
    <div className="relative isolate flex min-h-dvh flex-col bg-sidebar">
      {/* Unsplash photo-1556740758-90de374c12ad (Unsplash License) */}
      <img
        src="/auth/login-hero.webp"
        alt=""
        className="fixed inset-0 -z-10 size-full object-cover object-[35%_center]"
      />
      <div
        aria-hidden
        className="fixed inset-0 -z-10 bg-linear-to-t from-sidebar/95 via-sidebar/70 to-sidebar/40 lg:bg-linear-to-r lg:from-sidebar/90 lg:via-sidebar/55 lg:to-sidebar/30"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -bottom-40 -left-40 -z-10 size-[36rem] rounded-full bg-primary/30 blur-3xl"
      />

      <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <div className="flex items-center gap-3 text-lg font-semibold text-white">
          <img
            src="/icon.svg"
            alt=""
            className="size-10 rounded-xl shadow-lg ring-1 ring-white/20"
          />
          {t('common:appName')}
        </div>
        <div className="flex gap-1 rounded-full border border-white/15 bg-card/80 p-1 shadow-lg backdrop-blur-md">
          <LanguageMenu />
          <ThemeMenu />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1200px] flex-1 items-center gap-12 px-4 pb-10 sm:px-8 lg:grid-cols-[1fr_440px]">
        <div className="hidden max-w-xl space-y-8 text-white lg:block">
          <p className="text-5xl leading-[1.1] font-semibold tracking-tight text-balance">
            {t('login.tagline')}
          </p>
          <ul className="flex flex-wrap gap-2">
            {MODULES.map((m) => (
              <li
                key={m}
                className="rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-sm font-medium text-white/90 backdrop-blur-md"
              >
                {m}
              </li>
            ))}
          </ul>
        </div>

        <div className="w-full animate-in rounded-3xl border border-white/20 bg-card/85 p-6 text-card-foreground shadow-2xl shadow-black/30 backdrop-blur-2xl duration-500 fade-in slide-in-from-bottom-4 motion-reduce:animate-none sm:p-10">
          {children}
        </div>
      </main>
    </div>
  );
}
