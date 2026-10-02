import { ClockIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { COMING_SOON } from '../guide-content';

/** Menu items that are visible but not built yet. */
export function ComingSoon() {
  const { t } = useTranslation('guide');
  return (
    <section id="comingSoon" aria-labelledby="comingSoon-title" className="scroll-mt-28 space-y-4">
      <h2 id="comingSoon-title" className="text-2xl font-semibold tracking-tight">
        {t('comingSoon.title')}
      </h2>
      <p className="max-w-3xl text-muted-foreground">{t('comingSoon.intro')}</p>
      <ul className="grid gap-3 sm:grid-cols-3">
        {COMING_SOON.map((k) => (
          <li key={k} className="flex gap-3 rounded-xl border bg-card p-4">
            <ClockIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium">{t(`comingSoon.items.${k}.title`)}</p>
              <p className="text-sm text-muted-foreground">{t(`comingSoon.items.${k}.body`)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
