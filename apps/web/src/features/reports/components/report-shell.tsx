import { Alert, Button, FilterChip, Input, PageHeader } from '@rbp/ui';
import { DownloadIcon, PrinterIcon } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { Screen } from '@/components/screen';
import { useMe } from '@/features/auth/api/queries';
import { LocationSelect } from '@/features/inventory/components/location-select';
import { formatPlainDate } from '@/features/purchasing/lib/status';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { localDay, PRESETS, type Preset, type useReportParams } from '../lib/period';

/**
 * REP-001…006 frame: period presets + custom from–to, location (or all), CSV download and an
 * A4 print of the report body (`data-print-root="report"`; controls don't print).
 */
export function ReportShell({
  id,
  title,
  description,
  rp,
  filters,
  onCsv,
  csvDisabled,
  children,
}: {
  id: string;
  title: string;
  description: string;
  rp: ReturnType<typeof useReportParams>;
  /** Report-specific filters after period and location. */
  filters?: ReactNode;
  onCsv: () => void;
  csvDisabled?: boolean;
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation('reports');
  const locale = localeFor(i18n.language);
  const { data: me } = useMe();
  const ids = { from: useId(), to: useId(), error: useId() };
  const today = localDay();
  const period =
    rp.from === rp.to
      ? formatPlainDate(rp.from, locale)
      : `${formatPlainDate(rp.from, locale)} – ${formatPlainDate(rp.to, locale)}`;

  return (
    <Screen id={id} title={title} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={title}
        description={description}
        actions={
          <>
            <Button variant="outline" onClick={onCsv} disabled={csvDisabled}>
              <DownloadIcon /> {t('shell.csv')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (!navigator.userAgent.includes('jsdom')) window.print();
              }}
            >
              <PrinterIcon /> {t('shell.print')}
            </Button>
          </>
        }
      />
      <div className="space-y-3 print:hidden">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('shell.period')}>
          {(Object.keys(PRESETS) as Preset[]).map((p) => (
            <FilterChip
              key={p}
              active={rp.preset === p}
              onClick={() => {
                const [f, to] = PRESETS[p]();
                rp.setPeriod(f, to);
              }}
            >
              {t(`shell.presets.${p}`)}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label htmlFor={ids.from} className="text-sm font-medium">
              {t('shell.from')}
            </label>
            <Input
              id={ids.from}
              type="date"
              value={rp.from}
              max={rp.to < today ? rp.to : today}
              aria-invalid={!!rp.error || undefined}
              aria-describedby={rp.error ? ids.error : undefined}
              className="w-full sm:w-44"
              onChange={(e) => e.target.value && rp.setPeriod(e.target.value, rp.to)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.to} className="text-sm font-medium">
              {t('shell.to')}
            </label>
            <Input
              id={ids.to}
              type="date"
              value={rp.to}
              min={rp.from}
              max={today}
              aria-invalid={!!rp.error || undefined}
              aria-describedby={rp.error ? ids.error : undefined}
              className="w-full sm:w-44"
              onChange={(e) => e.target.value && rp.setPeriod(rp.from, e.target.value)}
            />
          </div>
          <LocationSelect
            value={rp.locationId}
            onChange={rp.setLocation}
            allowAll
            label={t('shell.location')}
          />
          {filters}
        </div>
      </div>
      <div data-print-root="report" className="space-y-section">
        <header className="hidden print:block">
          <p className="text-lg font-bold">{title}</p>
          <p className="text-sm">
            {me?.tenant.name} · {period} · {rp.locationLabel ?? t('shell.allLocations')}
          </p>
        </header>
        {rp.error ? (
          <Alert id={ids.error} tone="warning" title={t('shell.invalidTitle')}>
            {t(`shell.error.${rp.error}`)}
          </Alert>
        ) : (
          children
        )}
      </div>
    </Screen>
  );
}
