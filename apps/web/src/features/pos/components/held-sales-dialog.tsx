import type { Order } from '@rbp/types';
import { Button, EmptyState, ResponsiveDialog, Skeleton, toast } from '@rbp/ui';
import { formatElapsed, formatMoney } from '@rbp/utils';
import { PauseCircleIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { useErrorMessage } from '@/components/use-error-message';
import { useOrders, useResumeOrder } from '../api/orders';

/** POS-010: held sales at this location; Resume loads one into the (empty) draft. */
export function HeldSalesDialog({
  open,
  onOpenChange,
  draftEmpty,
  onResumed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draftEmpty: boolean;
  onResumed: (order: Order) => void;
}) {
  const { t, i18n } = useTranslation('pos');
  const locale = localeFor(i18n.language);
  const errorMessage = useErrorMessage();
  const held = useOrders({ status: 'HELD', pageSize: 50 }, open);
  const resume = useResumeOrder();

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('hold.heldTitle')}
      closeLabel={t('closeSale')}
      size="lg"
    >
      <div data-screen-id="POS-010" className="space-y-3">
        {!draftEmpty && (
          <p role="status" className="rounded-lg bg-status-warning/10 p-3 text-sm">
            {t('hold.draftNotEmpty')}
          </p>
        )}
        {held.isPending ? (
          <Skeleton className="h-32" />
        ) : !held.data?.items.length ? (
          <EmptyState icon={PauseCircleIcon} title={t('hold.empty')} />
        ) : (
          <ul className="divide-y rounded-xl border">
            {held.data.items.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {o.number}
                    {o.holdLabel && (
                      <span className="ml-2 font-normal text-muted-foreground">
                        · {o.holdLabel}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('history.items', { count: o.totals.itemCount })} ·{' '}
                    {t('hold.by', {
                      name: o.createdBy,
                      ago: formatElapsed(o.heldAt ?? o.createdAt),
                    })}
                  </p>
                </div>
                <span className="font-semibold tabular">{formatMoney(o.totals.total, locale)}</span>
                <Button
                  size="pos"
                  disabled={!draftEmpty || resume.isPending}
                  aria-label={`${t('hold.resume')} ${o.number}`}
                  onClick={() =>
                    resume.mutate(o.id, {
                      onSuccess: (order) => {
                        onResumed(order);
                        toast.success(t('hold.resumed', { number: order.number }));
                        onOpenChange(false);
                      },
                      onError: (e) => toast.error(errorMessage(e)),
                    })
                  }
                >
                  {t('hold.resume')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ResponsiveDialog>
  );
}
