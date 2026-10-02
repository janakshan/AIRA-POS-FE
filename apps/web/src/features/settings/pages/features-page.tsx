import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
  Skeleton,
  StatusBadge,
} from '@rbp/ui';
import { useTranslation } from 'react-i18next';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useFeatureSettings } from '../api/queries';
import { Meter } from '../components/meter';

/** SET-010 Features: read-only view of the plan (ADR-011: entitlements are platform-managed). */
export function FeaturesPage() {
  const { t } = useTranslation('settings');
  const plan = useFeatureSettings();
  return (
    <Screen id="SET-010" title={t('features.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('features.title')}
        description={t('features.hint')}
      />
      {plan.isError ? (
        <Card>
          <QueryError error={plan.error} onRetry={() => void plan.refetch()} />
        </Card>
      ) : !plan.data ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>{t('features.plan')}</CardTitle>
                <CardDescription>{t('features.contact')}</CardDescription>
              </div>
              <StatusBadge tone={plan.data.status === 'ACTIVE' ? 'success' : 'warning'}>
                {t(`features.status.${plan.data.status}`)}
              </StatusBadge>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              {plan.data.limits.map((l) => (
                <Meter
                  key={l.code}
                  limit
                  label={`${t(`features.limits.${l.code}`)}: ${
                    l.max === null
                      ? t('features.unlimited', { used: l.used })
                      : t('features.used', { used: l.used, max: l.max })
                  }`}
                  value={l.used}
                  max={l.max}
                />
              ))}
            </CardContent>
          </Card>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {plan.data.features.map((f) => (
              <Card
                key={f.code}
                role="region"
                aria-label={t(`common:features.${f.code}`)}
                className={f.enabled ? '' : 'opacity-70'}
              >
                <CardContent className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold">{t(`common:features.${f.code}`)}</h2>
                    <StatusBadge tone={f.enabled ? 'success' : 'neutral'} size="sm">
                      {t(f.enabled ? 'features.on' : 'features.off')}
                    </StatusBadge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t(`features.descriptions.${f.code}`)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </Screen>
  );
}
