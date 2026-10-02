import { Card, PageHeader, PageSkeleton, StatusBadge } from '@rbp/ui';
import { formatDateTime, formatMoney } from '@rbp/utils';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { MovementTable } from '@/features/inventory/components/movement-table';
import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { useBreadcrumbTitle } from '@/navigation/breadcrumb-store';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useReturn } from '../api/queries';

/** WHO-005 return: what came back in what condition, the credit, and the stock movements. */
export function ReturnDetailPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation('wholesale');
  const locale = localeFor(i18n.language);
  const { nameOf } = useMyLocations();
  const ret = useReturn(id);
  useBreadcrumbTitle(ret.data?.number);
  if (ret.isError) return <QueryError error={ret.error} onRetry={() => ret.refetch()} />;
  if (!ret.data) return <PageSkeleton />;
  const r = ret.data;
  const link =
    'inline-flex items-center font-medium underline-offset-2 hover:underline pointer-coarse:min-h-11';

  return (
    <Screen id="WHO-005" title={r.number} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={r.number}
        description={
          <Link to={`/customers/external-shops/${r.shopId}`} className={link}>
            {r.shopName}
          </Link>
        }
      />
      <Card className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label={t('fields.credit')}>
          <span className="font-semibold">{formatMoney(r.credit, locale)}</span>
        </Fact>
        <Fact label={t('fields.balance')}>{formatMoney(r.balanceAfter, locale)}</Fact>
        <Fact label={t('fields.invoice')}>
          {r.invoiceId ? (
            <Link to={`/wholesale/field-sales/${r.invoiceId}`} className={link}>
              {r.invoiceNumber}
            </Link>
          ) : (
            '—'
          )}
        </Fact>
        <Fact label={t('fields.reason')}>
          {r.reason.label}
          <span className="block text-xs text-muted-foreground">
            {t('returnDetail.approvedBy', { name: r.approvedBy })} ·{' '}
            {formatDateTime(r.at, { locale })}
          </span>
        </Fact>
        <Fact label={t('returnDetail.van')}>{nameOf(r.locationId)}</Fact>
      </Card>
      <Card className="p-0">
        <table className="w-full text-sm">
          <caption className="px-4 pt-4 text-left font-semibold">{t('returnForm.items')}</caption>
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground uppercase">
              <th scope="col" className="px-4 py-2 font-medium">
                {t('fields.item')}
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                {t('fields.condition')}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                {t('fields.qty')}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                {t('fields.credit')}
              </th>
            </tr>
          </thead>
          <tbody>
            {r.lines.map((l) => (
              <tr key={`${l.productId}:${l.condition}`} className="border-b last:border-0">
                <th scope="row" className="px-4 py-2 text-left font-medium">
                  {l.name}
                </th>
                <td className="px-4 py-2">
                  <StatusBadge tone={l.condition === 'GOOD' ? 'success' : 'danger'} size="sm">
                    {t(`condition.${l.condition}`)}
                  </StatusBadge>
                </td>
                <td className="px-4 py-2 text-right tabular">{l.quantity}</td>
                <td className="px-4 py-2 text-right tabular">
                  {formatMoney(l.lineCredit, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <section className="space-y-3" aria-labelledby="ret-moves">
        <h2 id="ret-moves" className="text-lg font-semibold">
          {t('returnDetail.movements')}
        </h2>
        <Card className="p-0">
          <MovementTable caption={t('returnDetail.movements')} rows={r.movements} />
        </Card>
      </section>
    </Screen>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 text-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="break-words">{children}</div>
    </div>
  );
}
