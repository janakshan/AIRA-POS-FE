import type { WholesaleReturn } from '@rbp/types';
import {
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterBar,
  FilterChip,
  MoneyText,
  PageHeader,
} from '@rbp/ui';
import { formatDateTime } from '@rbp/utils';
import { PlusIcon, Undo2Icon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useReturns } from '../api/queries';

const RANGES = { today: 0, week: 6, month: 29 } as const;
type Range = keyof typeof RANGES;

/** WHO-005 Returns: goods back from shops, by condition, credited to their balance. */
export function ReturnsPage() {
  const { t, i18n } = useTranslation('wholesale');
  const locale = localeFor(i18n.language);
  const navigate = useNavigate();
  const list = useListParams({ filterKeys: ['range'] });
  const range: Range =
    (Object.keys(RANGES) as Range[]).find((r) => r === list.filters.range) ?? 'month';
  const returns = useReturns({ days: RANGES[range] });

  const columns: DataTableColumn<WholesaleReturn>[] = [
    {
      id: 'number',
      header: t('fields.return'),
      primary: true,
      width: 'w-36',
      cell: (r) => <span className="font-semibold">{r.number}</span>,
    },
    {
      id: 'shop',
      header: t('fields.shop'),
      cell: (r) => <span className="font-medium">{r.shopName}</span>,
    },
    {
      id: 'at',
      header: t('fields.date'),
      width: 'w-44',
      hideOnTablet: true,
      cell: (r) => formatDateTime(r.at, { locale }),
    },
    {
      id: 'items',
      header: t('fields.items'),
      hideOnTablet: true,
      cell: (r) => (
        <span className="text-sm">
          {r.lines
            .map((l) => `${l.name} ×${l.quantity} (${t(`condition.${l.condition}`)})`)
            .join(', ')}
        </span>
      ),
    },
    {
      id: 'invoice',
      header: t('fields.invoice'),
      width: 'w-36',
      hideOnTablet: true,
      cell: (r) => r.invoiceNumber ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'credit',
      header: t('fields.credit'),
      align: 'right',
      width: 'w-32',
      cell: (r) => <MoneyText value={r.credit} locale={locale} className="font-semibold" />,
    },
  ];

  return (
    <Screen id="WHO-005" title={t('returns.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('returns.title')}
        description={t('returns.hint')}
        actions={
          <Button asChild>
            <Link to="new">
              <PlusIcon /> {t('returns.new')}
            </Link>
          </Button>
        }
      />
      <Card className="p-0">
        <DataTable
          caption={t('returns.caption')}
          columns={columns}
          rows={returns.data}
          getRowId={(r) => r.id}
          getRowLabel={(r) => `${r.number} ${r.shopName}`}
          loading={returns.isPending}
          onRowClick={(r) => navigate(`/wholesale/returns/${r.id}`)}
          error={
            returns.isError ? (
              <QueryError error={returns.error} onRetry={() => returns.refetch()} />
            ) : undefined
          }
          empty={<EmptyState icon={Undo2Icon} title={t('returns.empty')} />}
          toolbar={
            <FilterBar
              filters={(Object.keys(RANGES) as Range[]).map((r) => (
                <FilterChip
                  key={r}
                  active={range === r}
                  onClick={() => list.setFilter('range', r === 'month' ? null : r)}
                >
                  {t(`range.${r}`)}
                </FilterChip>
              ))}
            />
          }
        />
      </Card>
    </Screen>
  );
}
