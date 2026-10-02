import type { FinishedGoodsItem, WastageEntry, WastageSource } from '@rbp/types';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  type DataTableColumn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  FilterBar,
  FilterChip,
  PageHeader,
  Skeleton,
  StatusBadge,
} from '@rbp/ui';
import { formatDateTime } from '@rbp/utils';
import { ChevronDownIcon, SearchXIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { LocationSelect } from '@/features/inventory/components/location-select';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useFinishedGoods, useWastage } from '../api/queries';
import { WastageDialog } from '../components/wastage-dialog';
import { useProductionLocation } from '../lib/location';

const SOURCES: WastageSource[] = ['BATCH', 'FINISHED_GOODS'];
const RANGES = { today: 0, week: 6, month: 29 } as const;
type Range = keyof typeof RANGES;

/**
 * BAK-005 Wastage: batch rejects and finished goods written off, straight from the ledger,
 * with totals by reason. Write-offs need an employee PIN and a reason.
 */
export function WastagePage() {
  const { t, i18n } = useTranslation('production');
  const locale = localeFor(i18n.language);
  const { list, locationId, locationName, setLocation } = useProductionLocation([
    'source',
    'range',
    'reason',
  ]);
  const source = SOURCES.find((s) => s === list.filters.source);
  const range: Range =
    (Object.keys(RANGES) as Range[]).find((r) => r === list.filters.range) ?? 'week';
  const reasonCode = list.filters.reason ?? undefined;
  const wastage = useWastage({
    locationId,
    days: RANGES[range],
    ...(source ? { source } : {}),
    ...(reasonCode ? { reasonCode } : {}),
  });
  const goods = useFinishedGoods(locationId);
  const [writingOff, setWritingOff] = useState<FinishedGoodsItem | null>(null);

  const columns: DataTableColumn<WastageEntry>[] = [
    {
      id: 'at',
      header: t('fields.date'),
      width: 'w-44',
      cell: (w) => formatDateTime(w.at, { locale }),
    },
    {
      id: 'product',
      header: t('fields.product'),
      primary: true,
      cell: (w) => <span className="font-medium">{w.productName}</span>,
    },
    {
      id: 'quantity',
      header: t('fields.quantity'),
      align: 'right',
      width: 'w-24',
      cell: (w) => (
        <span className="font-semibold text-status-danger-fg tabular">{w.quantity}</span>
      ),
    },
    {
      id: 'reason',
      header: t('fields.reason'),
      cell: (w) => (
        <span className="text-sm">
          {w.reason.label}
          {w.reason.comment && (
            <span className="block text-xs text-muted-foreground">{w.reason.comment}</span>
          )}
        </span>
      ),
    },
    {
      id: 'source',
      header: t('fields.source'),
      cell: (w) => (
        <span className="inline-flex flex-wrap items-center gap-1.5 text-sm">
          <StatusBadge tone={w.source === 'BATCH' ? 'warning' : 'neutral'} size="sm">
            {t(`source.${w.source}`)}
          </StatusBadge>
          {w.batchId ? (
            <Link
              to={`/production/batches/${w.batchId}`}
              className="inline-flex items-center font-medium underline-offset-2 hover:underline pointer-coarse:min-h-11"
            >
              {w.number}
            </Link>
          ) : (
            <span className="font-medium">{w.number}</span>
          )}
        </span>
      ),
    },
    {
      id: 'by',
      header: t('fields.by'),
      hideOnTablet: true,
      cell: (w) => (
        <span className="text-sm">
          {w.recordedBy}
          {w.approvedBy && (
            <span className="block text-xs text-muted-foreground">
              {t('wastage.approvedBy', { name: w.approvedBy })}
            </span>
          )}
        </span>
      ),
    },
  ];

  return (
    <Screen id="BAK-005" title={t('wastage.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('wastage.title')}
        description={t('wastage.hint', { location: locationName })}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button disabled={!goods.data?.some((g) => g.onHand > 0)}>
                <Trash2Icon /> {t('wastage.record')} <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {goods.data
                ?.filter((g) => g.onHand > 0)
                .map((g) => (
                  <DropdownMenuItem key={g.productId} onSelect={() => setWritingOff(g)}>
                    {g.name}
                    <span className="ml-auto pl-4 text-xs text-muted-foreground tabular">
                      {g.onHand}
                    </span>
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('wastage.byReason')}</CardTitle>
        </CardHeader>
        <CardContent>
          {!wastage.data ? (
            <Skeleton className="h-10" />
          ) : !wastage.data.byReason.length ? (
            <p className="text-sm text-muted-foreground">{t('wastage.none')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {wastage.data.byReason.map((r) => (
                <FilterChip
                  key={r.code}
                  active={reasonCode === r.code}
                  onClick={() => list.setFilter('reason', reasonCode === r.code ? null : r.code)}
                >
                  {r.label} · {r.quantity}
                </FilterChip>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="p-0">
        <DataTable
          caption={t('wastage.caption')}
          columns={columns}
          rows={wastage.data?.items}
          getRowId={(w) => w.id}
          getRowLabel={(w) => `${w.productName} ${w.quantity} ${w.reason.label}`}
          loading={wastage.isPending}
          error={
            wastage.isError ? (
              <QueryError error={wastage.error} onRetry={() => wastage.refetch()} />
            ) : undefined
          }
          empty={<EmptyState icon={SearchXIcon} title={t('wastage.empty')} />}
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
              filters={
                <>
                  {(Object.keys(RANGES) as Range[]).map((r) => (
                    <FilterChip
                      key={r}
                      active={range === r}
                      onClick={() => list.setFilter('range', r === 'week' ? null : r)}
                    >
                      {t(`wastage.range.${r}`)}
                    </FilterChip>
                  ))}
                  {([null, ...SOURCES] as const).map((s) => (
                    <FilterChip
                      key={s ?? 'any'}
                      active={(source ?? null) === s}
                      onClick={() => list.setFilter('source', s)}
                    >
                      {s ? t(`source.${s}`) : t('wastage.anySource')}
                    </FilterChip>
                  ))}
                </>
              }
            />
          }
          footer={
            wastage.data && wastage.data.items.length > 0 ? (
              <p className="px-4 py-3 text-sm font-medium" aria-live="polite">
                {t('wastage.total', { count: wastage.data.total })}
              </p>
            ) : undefined
          }
        />
      </Card>

      <WastageDialog item={writingOff} onOpenChange={(o) => !o && setWritingOff(null)} />
    </Screen>
  );
}
