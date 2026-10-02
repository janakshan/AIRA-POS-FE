import type { ProductionFormula } from '@rbp/types';
import { Button, Card, DataTable, type DataTableColumn, EmptyState, PageHeader } from '@rbp/ui';
import { formatDateTime } from '@rbp/utils';
import { CakeSliceIcon, PencilIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { LocationSelect } from '@/features/inventory/components/location-select';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useProductionFormulas } from '../api/queries';
import { useProductionLocation } from '../lib/location';

/**
 * BAK-006 Formulas (A-309): what one batch run of each bakery product uses and makes. Editing
 * applies to plans confirmed afterwards; confirmed plans and their batches keep their quantities.
 */
export function FormulaListPage() {
  const { t, i18n } = useTranslation('production');
  const locale = localeFor(i18n.language);
  const { locationId, setLocation } = useProductionLocation();
  const formulas = useProductionFormulas(locationId);
  const query = new URLSearchParams({ location: locationId }).toString();

  const columns: DataTableColumn<ProductionFormula>[] = [
    {
      id: 'product',
      header: t('fields.product'),
      primary: true,
      cell: (f) => (
        <span>
          <span className="font-medium">{f.productName}</span>
          <span className="block font-mono text-xs text-muted-foreground">{f.productCode}</span>
        </span>
      ),
    },
    {
      id: 'yield',
      header: t('formulas.yield'),
      align: 'right',
      width: 'w-32',
      cell: (f) => (
        <span className="font-semibold tabular">
          {t('formulas.perRun', {
            count: f.yieldQuantity,
            unit: t(`inventory:unit.${f.unit}`, { count: f.yieldQuantity }),
          })}
        </span>
      ),
    },
    {
      id: 'materials',
      header: t('formulas.materials'),
      cell: (f) => (
        <ul className="space-y-0.5 text-sm">
          {f.lines.map((l) => (
            <li key={l.ingredientId} className="flex justify-between gap-3">
              <span>{l.name}</span>
              <span className="text-muted-foreground tabular">
                {l.quantity} {t(`inventory:unit.${l.unit}`, { count: l.quantity })}
              </span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: 'changed',
      header: t('formulas.lastChange'),
      hideOnTablet: true,
      cell: (f) => (
        <span className="text-sm text-muted-foreground">
          {f.updatedAt && f.updatedBy
            ? t('formulas.changed', {
                at: formatDateTime(f.updatedAt, { locale }),
                by: f.updatedBy,
              })
            : t('formulas.seeded')}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      cell: (f) => (
        <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
          <Link
            to={`/production/formulas/${f.productId}/edit?${query}`}
            aria-label={t('formulas.editFor', { name: f.productName })}
          >
            <PencilIcon /> {t('formulas.edit')}
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <Screen id="BAK-006" title={t('formulas.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('formulas.title')}
        description={t('formulas.hint')}
      />
      <LocationSelect
        value={locationId}
        onChange={setLocation}
        types={['BAKERY']}
        label={t('fields.location')}
      />
      <Card className="p-0">
        <DataTable
          caption={t('formulas.caption')}
          columns={columns}
          rows={formulas.data}
          getRowId={(f) => f.productId}
          getRowLabel={(f) => f.productName}
          loading={formulas.isPending}
          error={
            formulas.isError ? (
              <QueryError error={formulas.error} onRetry={() => formulas.refetch()} />
            ) : undefined
          }
          empty={<EmptyState icon={CakeSliceIcon} title={t('formulas.empty')} />}
        />
      </Card>
    </Screen>
  );
}
