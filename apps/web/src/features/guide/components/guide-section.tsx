import { Alert, Badge } from '@rbp/ui';
import { useTranslation } from 'react-i18next';
import type { GuideSection as Section } from '../guide-types';
import { GuideShot } from './guide-shot';
import { GuideText } from './guide-text';

/** One chapter: title, intro, who can use it, then numbered tasks with screenshots. */
export function GuideSection({ section }: { section: Section }) {
  const { t, i18n } = useTranslation('guide');
  const base = `sections.${section.key}`;
  const Icon = section.icon;

  return (
    <section
      id={section.key}
      aria-labelledby={`${section.key}-title`}
      className="scroll-mt-28 space-y-6"
    >
      <header className="space-y-3 border-b pb-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-5" />
          </span>
          <h2 id={`${section.key}-title`} className="text-2xl font-semibold tracking-tight">
            {t(`${base}.title`)}
          </h2>
        </div>
        <p className="max-w-3xl text-muted-foreground">
          <GuideText k={`${base}.intro`} />
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t('page.usedBy')}</span>
          {section.roles.map((r) => (
            <Badge key={r} variant="secondary">
              {t(`roles.names.${r}`)}
            </Badge>
          ))}
        </div>
      </header>

      {section.tasks.map((task) => {
        const tb = `${base}.tasks.${task.key}`;
        return (
          <article
            key={task.key}
            id={`${section.key}-${task.key}`}
            className="scroll-mt-28 space-y-4 rounded-xl border bg-card p-4 sm:p-6"
          >
            <h3 className="text-lg font-semibold">{t(`${tb}.title`)}</h3>
            {i18n.exists(`guide:${tb}.intro`) && (
              <p className="text-muted-foreground">
                <GuideText k={`${tb}.intro`} />
              </p>
            )}
            <ol className="space-y-5">
              {task.steps.map((step, i) => {
                const sk = `${tb}.steps.${step.key}`;
                return (
                  <li key={step.key} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
                    <span
                      aria-hidden
                      className="flex size-7 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
                    >
                      {i + 1}
                    </span>
                    <div className="space-y-3 pt-0.5">
                      <p>
                        <GuideText k={sk} />
                      </p>
                      {step.shot && (
                        <GuideShot
                          shot={step.shot}
                          mobile={step.mobile}
                          alt={t(sk).replace(/<\/?b>/g, '')}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            {i18n.exists(`guide:${tb}.note`) && (
              <Alert tone="info" className="text-sm">
                <GuideText k={`${tb}.note`} />
              </Alert>
            )}
          </article>
        );
      })}
    </section>
  );
}
