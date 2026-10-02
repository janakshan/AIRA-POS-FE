import { Button, ResponsiveDialog, Skeleton, toast } from '@rbp/ui';
import { formatMoney } from '@rbp/utils';
import { PrinterIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { useErrorMessage } from '@/components/use-error-message';
import { usePrintReceipt, useReceipt } from '../api/orders';
import { ReceiptView } from './receipt-view';

export interface ReceiptTarget {
  orderId: string;
  returnId?: string;
}

/**
 * POS-009 Receipt preview after payment (or a reprint / return receipt). Printing goes to the
 * simulated receipt printer (audited; later copies are REPRINTs) and the browser print dialog.
 */
export function ReceiptDialog({
  target,
  onOpenChange,
  onNewSale,
}: {
  target: ReceiptTarget | null;
  onOpenChange: (open: boolean) => void;
  /** Shown right after a sale; omitted for reprints. */
  onNewSale?: () => void;
}) {
  const { t, i18n } = useTranslation('pos');
  const locale = localeFor(i18n.language);
  const errorMessage = useErrorMessage();
  const receipt = useReceipt(target?.orderId, target?.returnId);
  const print = usePrintReceipt();

  const doPrint = () => {
    if (!target) return;
    print.mutate(
      { id: target.orderId, ...(target.returnId ? { returnId: target.returnId } : {}) },
      {
        onSuccess: ({ printer }) => {
          toast.success(t('receipt.sentToPrinter', { printer }));
          // Real browsers also get the print dialog; jsdom (tests) doesn't implement it.
          if (!navigator.userAgent.includes('jsdom')) window.print();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  const data = receipt.data;
  return (
    <ResponsiveDialog
      open={!!target}
      onOpenChange={onOpenChange}
      title={
        data
          ? t(data.kind === 'RETURN' ? 'receipt.returnTitle' : 'receipt.title', {
              number: data.number,
            })
          : ' '
      }
      closeLabel={t('receipt.close')}
      footer={
        <>
          <Button
            variant="outline"
            size="pos"
            onClick={doPrint}
            loading={print.isPending}
            disabled={!data}
          >
            <PrinterIcon /> {t('receipt.print')}
          </Button>
          {onNewSale ? (
            <Button size="pos" onClick={onNewSale}>
              {t('receipt.newSale')}
            </Button>
          ) : (
            <Button size="pos" variant="secondary" onClick={() => onOpenChange(false)}>
              {t('receipt.close')}
            </Button>
          )}
        </>
      }
    >
      <div data-screen-id="POS-009" className="space-y-4">
        {data?.change && data.change.amount > 0 && onNewSale && (
          <div className="rounded-xl bg-status-success/10 px-4 py-3 text-center" aria-live="polite">
            <p className="text-sm text-muted-foreground">{t('receipt.changeDue')}</p>
            <p className="text-4xl font-bold tabular">{formatMoney(data.change, locale)}</p>
          </div>
        )}
        {receipt.isError ? (
          <QueryError error={receipt.error} onRetry={() => receipt.refetch()} />
        ) : !data ? (
          <Skeleton className="mx-auto h-96 max-w-[22rem]" />
        ) : (
          <div
            // Scrollable: keyboard users can focus it and scroll with the arrow keys.
            tabIndex={0}
            role="region"
            aria-label={data.number}
            className="max-h-[55dvh] overflow-y-auto rounded-lg bg-muted/40 p-3 focus-ring"
          >
            <ReceiptView receipt={data} />
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}
