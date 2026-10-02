import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rbp/ui';
import { cn } from '@rbp/utils';
import { LogInIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Screen } from '@/components/screen';
import { LanguageMenu } from '@/layouts/components/language-menu';
import { ThemeMenu } from '@/layouts/components/theme-menu';
import { useSessionStore } from '@/stores/session-store';
import { ComingSoon } from '../components/coming-soon';
import { GuideSection } from '../components/guide-section';
import { RoleMatrix } from '../components/role-matrix';
import { GUIDE_SECTIONS } from '../guide-content';

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Public user guide: every working feature, step by step, with screenshots. No sign-in needed. */
export function GuidePage() {
  const { t } = useTranslation('guide');
  const signedIn = useSessionStore((s) => !!s.accessToken);
  const anchors = useMemo(
    () => [
      ...GUIDE_SECTIONS.map((s) => ({ id: s.key, label: t(`sections.${s.key}.title`) })),
      { id: 'roles', label: t('roles.title') },
      { id: 'comingSoon', label: t('comingSoon.title') },
    ],
    [t],
  );
  const [active, setActive] = useState(anchors[0]?.id ?? '');

  // Highlight the chapter currently in view.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-120px 0px -70% 0px' },
    );
    anchors.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [anchors]);

  const go = (id: string) => {
    setActive(id);
    scrollToSection(id);
  };

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-sticky border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link
            to="/guide"
            className="flex touch-safe min-w-0 items-center gap-2.5 font-semibold focus-ring"
          >
            <img src="/icon.svg" alt="" className="size-8 shrink-0" />
            <span className="truncate">{t('common:appName')}</span>
            <span className="hidden text-muted-foreground sm:inline">· {t('page.title')}</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <LanguageMenu />
            <ThemeMenu />
            <Button asChild size="sm" className="ml-1">
              <Link to={signedIn ? '/' : '/login'}>
                <LogInIcon /> {signedIn ? t('page.openApp') : t('page.signIn')}
              </Link>
            </Button>
          </div>
        </div>
        <div className="border-t px-4 py-2 lg:hidden">
          <Select value={active} onValueChange={go}>
            <SelectTrigger aria-label={t('page.jumpTo')} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {anchors.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label={t('page.contents')} className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pb-6">
            <p className="mb-2 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t('page.contents')}
            </p>
            <ul className="space-y-0.5">
              {anchors.map((a) => (
                <li key={a.id}>
                  <a
                    href={`#${a.id}`}
                    aria-current={active === a.id ? 'location' : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      go(a.id);
                    }}
                    className={cn(
                      'flex touch-safe items-center rounded-md px-3 py-1.5 text-sm text-muted-foreground focus-ring transition-colors hover:bg-accent hover:text-foreground',
                      active === a.id && 'bg-primary/10 font-medium text-primary',
                    )}
                  >
                    {a.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <main className="min-w-0">
          <Screen id="HELP-001" title={t('page.title')} className="space-y-16">
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {t('page.title')}
              </h1>
              <p className="max-w-3xl text-lg text-muted-foreground">{t('page.subtitle')}</p>
              <p className="max-w-3xl text-sm text-muted-foreground">{t('page.howTo')}</p>
            </div>
            {GUIDE_SECTIONS.map((s) => (
              <GuideSection key={s.key} section={s} />
            ))}
            <RoleMatrix />
            <ComingSoon />
          </Screen>
        </main>
      </div>
    </div>
  );
}
