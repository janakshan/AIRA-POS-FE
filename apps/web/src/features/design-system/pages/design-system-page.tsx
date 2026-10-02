import { PageHeader, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rbp/ui';
import { cn } from '@rbp/utils';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/screen';
import { ButtonsSection } from '../components/buttons-section';
import { DialogsSection } from '../components/dialogs-section';
import { FormsSection } from '../components/forms-section';
import { FoundationsSection } from '../components/foundations-section';
import { NavigationSection } from '../components/navigation-section';
import { PosSection } from '../components/pos-section';
import { StatesSection } from '../components/states-section';
import { StatusSection } from '../components/status-section';
import { TablesSection } from '../components/tables-section';
import { DS_SECTIONS } from '../sections';

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** DS-001 UI Kit — living reference for the design system (mock/dev builds only). */
export function DesignSystemPage() {
  const { t } = useTranslation('designSystem');
  const [active, setActive] = useState<string>(DS_SECTIONS[0]);

  // Highlight the section currently in view.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-120px 0px -70% 0px' },
    );
    DS_SECTIONS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <Screen id="DS-001" title={t('title')} className="space-y-section">
      <PageHeader title={t('title')} description={t('subtitle')} />

      <nav
        aria-label={t('jumpTo')}
        className="sticky top-0 z-sticky -mx-page border-b bg-background/95 px-page py-2 backdrop-blur"
      >
        <div className="md:hidden">
          <Select
            value={active}
            onValueChange={(v) => {
              setActive(v);
              scrollToSection(v);
            }}
          >
            <SelectTrigger aria-label={t('jumpTo')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DS_SECTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`sections.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ul className="scrollbar-none hidden gap-1 overflow-x-auto md:flex">
          {DS_SECTIONS.map((s) => (
            <li key={s}>
              <a
                href={`#${s}`}
                aria-current={active === s ? 'location' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  setActive(s);
                  scrollToSection(s);
                }}
                className={cn(
                  'inline-flex h-9 touch-safe items-center rounded-full px-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground focus-ring transition-colors hover:bg-accent hover:text-foreground',
                  active === s && 'bg-primary/10 text-primary',
                )}
              >
                {t(`sections.${s}`)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <FoundationsSection />
      <ButtonsSection />
      <FormsSection />
      <TablesSection />
      <DialogsSection />
      <StatusSection />
      <StatesSection />
      <PosSection />
      <NavigationSection />
    </Screen>
  );
}
