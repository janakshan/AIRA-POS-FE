import type { WholesaleInvoice } from '@rbp/types';
import { Alert, Button, Card, PageHeader, PageSkeleton, StatusBadge, toast } from '@rbp/ui';
import { formatDateTime, formatMoney } from '@rbp/utils';
import { PlusIcon, Undo2Icon, XCircleIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useErrorMessage } from '@/components/use-error-message';
import { useMe } from '@/features/auth/api/queries';
import { useSensitiveAction } from '@/features/auth/hooks/use-sensitive-action';
import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { useBreadcrumbTitle } from '@/navigation/breadcrumb-store';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useInvoice, useVoidInvoice } from '../api/queries';
import { dayOf, localDay } from '../lib/format';
import { InvoiceActions } from '../components/invoice-actions';
import { InvoiceView } from '../components/invoice-view';

const STATUS_TONE = { OPEN: 'warning', PAID: 'success', VOIDED: 'danger' } as const;

/** A-311 (POS-012's rule): why an invoice can't be voided, or null. */
function voidBlock(inv: WholesaleInvoice): 'returns' | 'day' | null {
  if (inv.lines.some((l) => l.returnedQuantity > 0)) return 'returns';
  if (dayOf(inv.at) !== localDay()) return 'day';
  return null;
}

/** WHO-003 invoice: the paper, print / share, what's still unpaid, and void (A-311). */
export function InvoicePage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation('wholesale');
  const locale = localeFor(i18n.language);
  const { data: me } = useMe();
  const { nameOf } = useMyLocations();
  const invoice = useInvoice(id);
  const voidInvoice = useVoidInvoice();
  const confirmSensitive = useSensitiveAction();
  const errorMessage = useErrorMessage();
  useBreadcrumbTitle(invoice.data?.number);

  if (invoice.isError)
    return <QueryError error={invoice.error} onRetry={() => invoice.refetch()} />;
  if (!invoice.data) return <PageSkeleton />;
  const inv = invoice.data;
  const voided = inv.status === 'VOIDED';
  const returnable = !voided && inv.lines.some((l) => l.quantity > l.returnedQuantity);
  const block = voided ? null : voidBlock(inv);
  const m = (v: WholesaleInvoice['total']) => formatMoney(v, locale);

  const doVoid = async () => {
    const verification = await confirmSensitive('wholesale.void', {
      reasonTitle: t('void.title', { number: inv.number }),
      reasonDescription: t('void.description'),
      summary: `${inv.number} · ${inv.shopName} · ${m(inv.total)}`,
    });
    if (!verification) return;
    voidInvoice.mutate(
      { id: inv.id, body: { verification } },
      {
        onSuccess: (v) =>
          toast.success(
            v.voided?.refunded
              ? t('void.doneRefund', { number: v.number, amount: m(v.voided.refunded.amount) })
              : t('void.done', { number: v.number }),
          ),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  return (
    <Screen id="WHO-003" title={inv.number} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {inv.number}
            <span className="text-sm font-normal">
              <StatusBadge tone={STATUS_TONE[inv.status]} size="md">
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
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/wholesale/field-sales">
                <PlusIcon /> {t('invoice.nextSale')}
              </Link>
            </Button>
            {!voided && (
              <Button
                variant="outline"
                className="text-destructive"
                disabled={!!block || voidInvoice.isPending}
                onClick={() => void doVoid()}
              >
                <XCircleIcon /> {t('void.action')}
              </Button>
            )}
          </div>
        }
      />
      {inv.voided && (
        <Alert tone="danger" title={t('void.voidedTitle', { name: inv.voided.approvedBy })}>
          {t('void.voidedReason', {
            reason: inv.voided.reason.comment
              ? `${inv.voided.reason.label} (${inv.voided.reason.comment})`
              : inv.voided.reason.label,
            at: formatDateTime(inv.voided.at, { locale }),
            by: inv.voided.voidedBy,
          })}
          {inv.voided.refunded &&
            ` ${t('void.refunded', {
              amount: m(inv.voided.refunded.amount),
              method: t(`method.${inv.voided.refunded.method}`),
            })}`}
        </Alert>
      )}
      {block && <Alert tone="info">{t(`void.blocked.${block}`)}</Alert>}
      {inv.creditWarning && (
        <Alert tone="warning" title={t('invoice.overLimitTitle')}>
          {t('invoice.overLimitHint')}
        </Alert>
      )}
      <div className="grid items-start gap-section lg:grid-cols-[minmax(0,24rem)_1fr]">
        <InvoiceView invoice={inv} business={me?.tenant.name ?? ''} van={nameOf(inv.locationId)} />
        <div className="space-y-section">
          {(!voided || inv.shares.length > 0 || inv.prints.length > 0) && (
            <Card className="space-y-3 p-4">
              {/* A-311: a voided invoice isn't sent again; its history stays. */}
              {!voided && (
                <>
                  <p className="text-sm font-medium">{t('invoice.sendTitle')}</p>
                  <InvoiceActions invoice={inv} />
                </>
              )}
              {(inv.shares.length > 0 || inv.prints.length > 0) && (
                <ul className="space-y-0.5 border-t pt-2 text-xs text-muted-foreground first:border-t-0 first:pt-0">
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
          )}
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
