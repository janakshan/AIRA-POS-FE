import type { ProductionBatch } from '@rbp/types';
import { Card, EmptyState, FilterBar, FilterChip, PageHeader } from '@rbp/ui';
import { FlameIcon, SearchXIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { LocationSelect } from '@/features/inventory/components/location-select';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useProductionBatches } from '../api/queries';
import { BatchTable } from '../components/batch-table';
import { RecordOutputDialog } from '../components/record-output-dialog';
import { StartBatchDialog } from '../components/start-batch-dialog';
import { useProductionLocation } from '../lib/location';
import { BATCH_STATUSES } from '../lib/status';

/** BAK-003 Production batches: each run from start (materials used) to output (goods in). */
export function BatchListPage() {
  const { t } = useTranslation('production');
  const { list, locationId, locationName, setLocation } = useProductionLocation(['status']);
  const status = BATCH_STATUSES.find((s) => s === list.filters.status);
  const batches = useProductionBatches({ locationId, ...(status ? { status } : {}) });
  const [starting, setStarting] = useState<ProductionBatch | null>(null);
  const [completing, setCompleting] = useState<ProductionBatch | null>(null);

  return (
    <Screen id="BAK-003" title={t('batches.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('batches.title')}
        description={t('batches.hint', { location: locationName })}
      />
      <Card className="p-0">
        <BatchTable
          caption={t('batches.caption')}
          rows={batches.data}
          loading={batches.isPending}
          error={
            batches.isError ? (
              <QueryError error={batches.error} onRetry={() => batches.refetch()} />
            ) : undefined
          }
          empty={
            status ? (
              <EmptyState icon={SearchXIcon} title={t('batches.noResults')} />
            ) : (
              <EmptyState icon={FlameIcon} title={t('batches.empty')} />
            )
          }
          toolbar={
            <FilterBar
              search={
                <LocationSelect
                  value={locationId}
                  onChange={setLocation}
                  types={['BAKERY']}
                  label={t('fields.location')}
                />
              }
              filters={([null, ...BATCH_STATUSES] as const).map((s) => (
                <FilterChip
                  key={s ?? 'any'}
                  active={(status ?? null) === s}
                  onClick={() => list.setFilter('status', s)}
                >
                  {s ? t(`batchStatus.${s}`) : t('batches.anyStatus')}
                </FilterChip>
              ))}
            />
          }
          onStart={setStarting}
          onComplete={setCompleting}
        />
      </Card>
      <StartBatchDialog batch={starting} onOpenChange={(o) => !o && setStarting(null)} />
      <RecordOutputDialog batch={completing} onOpenChange={(o) => !o && setCompleting(null)} />
    </Screen>
  );
}
