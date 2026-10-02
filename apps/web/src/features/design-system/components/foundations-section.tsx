import { useTranslation } from 'react-i18next';
import { DsSection, Example } from './section';

const COLORS = [
  'background',
  'foreground',
  'card',
  'primary',
  'secondary',
  'muted',
  'accent',
  'destructive',
  'success',
  'warning',
  'border',
  'sidebar',
];
const STATUS = ['neutral', 'info', 'warning', 'progress', 'success', 'danger'];
const TYPE = [
  ['text-display', 'Display 30/36'],
  ['text-title', 'Title 24/32'],
  ['text-heading', 'Heading 18/28'],
  ['text-body', 'Body 14/20'],
  ['text-caption', 'Caption 12/16'],
  ['text-overline uppercase', 'Overline 11/16'],
  ['text-pos-total tabular', 'POS total 36/40'],
  ['text-pos-tile', 'POS tile 15/19'],
] as const;
const SPACING = [1, 2, 3, 4, 6, 8, 12, 16];

export function FoundationsSection() {
  const { t } = useTranslation('designSystem');
  return (
    <DsSection id="foundations" title={t('sections.foundations')}>
      <Example title={t('foundations.colors')} hint={t('foundations.colorsHint')}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {COLORS.map((c) => (
            <div key={c} className="space-y-1.5">
              <div className="h-12 rounded-lg border" style={{ background: `var(--${c})` }} />
              <code className="block truncate text-caption text-muted-foreground">--{c}</code>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {STATUS.map((s) => (
            <div key={s} className="space-y-1.5">
              <div className="flex h-10 overflow-hidden rounded-lg border">
                <span className="flex-1" style={{ background: `var(--status-${s})` }} />
                <span className="flex-1" style={{ background: `var(--status-${s}-fg)` }} />
              </div>
              <code className="block truncate text-caption text-muted-foreground">status-{s}</code>
            </div>
          ))}
        </div>
      </Example>

      <Example title={t('foundations.typography')} hint={t('foundations.typographyHint')}>
        <div className="divide-y">
          {TYPE.map(([cls, label]) => (
            <div
              key={cls}
              className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-baseline sm:gap-6"
            >
              <code className="w-40 shrink-0 text-caption text-muted-foreground">{label}</code>
              <span className={`${cls} min-w-0 break-words`}>{t('foundations.sample')}</span>
            </div>
          ))}
          <div className="grid gap-2 py-3 sm:grid-cols-2">
            <p lang="ta" className="text-heading">
              {t('foundations.tamilSample')}
            </p>
            <p lang="si" className="text-heading">
              {t('foundations.sinhalaSample')}
            </p>
          </div>
        </div>
      </Example>

      <div className="grid gap-stack lg:grid-cols-2">
        <Example title={t('foundations.spacing')} hint={t('foundations.spacingHint')}>
          <div className="space-y-2">
            {SPACING.map((n) => (
              <div key={n} className="flex items-center gap-3">
                <code className="w-16 text-caption text-muted-foreground">{n * 4}px</code>
                <span className="h-3 rounded-sm bg-primary/70" style={{ width: `${n * 4}px` }} />
              </div>
            ))}
            <p className="pt-2 text-caption text-muted-foreground">
              p-page · gap-section · space-y-stack
            </p>
          </div>
        </Example>
        <Example title={t('foundations.radius')} hint={t('foundations.touchHint')}>
          <div className="flex flex-wrap items-end gap-4">
            {[
              ['size-touch', '44'],
              ['size-touch-pos', '56'],
              ['size-touch-pos-lg', '80'],
            ].map(([cls, px]) => (
              <div key={px} className="flex flex-col items-center gap-1.5">
                <div
                  className={`${cls} rounded-lg border-2 border-dashed border-primary/60 bg-primary/10`}
                />
                <code className="text-caption text-muted-foreground">{px}px</code>
              </div>
            ))}
            {['rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-xl'].map((r) => (
              <div key={r} className="flex flex-col items-center gap-1.5">
                <div className={`size-12 border bg-muted ${r}`} />
                <code className="text-caption text-muted-foreground">
                  {r.replace('rounded-', '')}
                </code>
              </div>
            ))}
          </div>
        </Example>
      </div>
    </DsSection>
  );
}
