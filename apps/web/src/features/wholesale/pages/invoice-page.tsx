import { Alert, Button, Card, PageHeader, PageSkeleton, StatusBadge } from '@rbp/ui';
import { formatDateTime } from '@rbp/utils';
import { PlusIcon, Undo2Icon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useMe } from '@/features/auth/api/queries';
import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { useBreadcrumbTitle } from '@/navigation/breadcrumb-store';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useInvoice } from '../api/queries';
import { InvoiceActions } from '../components/invoice-actions';
import { InvoiceView } from '../components/invoice-view';

/** WHO-003 invoice: the paper, print / share, and what's still unpaid. */
export function InvoicePage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation('wholesale');
  const locale = localeFor(i18n.language);
  const { data: me } = useMe();
  const { nameOf } = useMyLocations();
  const invoice = useInvoice(id);
  useBreadcrumbTitle(invoice.data?.number);

  if (invoice.isError)
    return <QueryError error={invoice.error} onRetry={() => invoice.refetch()} />;
  if (!invoice.data) return <PageSkeleton />;
  const inv = invoice.data;
  const returnable = inv.lines.some((l) => l.quantity > l.returnedQuantity);

  return (
    <Screen id="WHO-003" title={inv.number} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {inv.number}
            <span className="text-sm font-normal">
              <StatusBadge tone={inv.status === 'PAID' ? 'success' : 'warning'} size="md">
                {t(`invoiceStatus.${inv.status}`)}
              </StatusBadge>
            </span>
          </span>
        }
        description={
          <Link
            to={`/customers/external-shops/${inv.shopId}`}
            className="inline-flex items-center font-medium underline-offset-2 hover:underline pointer-coarse:min-h-11"
          >
            {inv.shopName}
          </Link>
        }
        actions={
          <Button asChild variant="outline">
            <Link to="/wholesale/field-sales">
              <PlusIcon /> {t('invoice.nextSale')}
            </Link>
          </Button>
        }
      />
      {inv.creditWarning && (
        <Alert tone="warning" title={t('invoice.overLimitTitle')}>
          {t('invoice.overLimitHint')}
        </Alert>
      )}
      <div className="grid items-start gap-section lg:grid-cols-[minmax(0,24rem)_1fr]">
        <InvoiceView invoice={inv} business={me?.tenant.name ?? ''} van={nameOf(inv.locationId)} />
        <div className="space-y-section">
          <Card className="space-y-3 p-4">
            <p className="text-sm font-medium">{t('invoice.sendTitle')}</p>
            <InvoiceActions invoice={inv} />
            {(inv.shares.length > 0 || inv.prints.length > 0) && (
              <ul className="space-y-0.5 border-t pt-2 text-xs text-muted-foreground">
                {inv.prints.map((p) => (
                  <li key={`p-${p.at}`}>
                    {t('invoice.printedBy', { name: p.by, at: formatDateTime(p.at, { locale }) })}
                  </li>
                ))}
                {inv.shares.map((s) => (
                  <li key={`s-${s.at}`}>
                    {t('invoice.sharedBy', {
                      channel: t(`channel.${s.channel}`),
                      name: s.by,
                      at: formatDateTime(s.at, { locale }),
                    })}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {returnable && (
            <Button asChild variant="outline">
              <Link
                to={`/wholesale/returns/new?${new URLSearchParams({ shop: inv.shopId, invoice: inv.id })}`}
              >
                <Undo2Icon /> {t('invoice.return')}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </Screen>
  );
}
