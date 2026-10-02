import type { StockTransfer } from '@rbp/types';
import { Button, ConfirmDialog, NumberInput, ResponsiveDialog, StatusBadge, toast } from '@rbp/ui';
import { formatDateTime } from '@rbp/utils';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { useErrorMessage } from '@/components/use-error-message';
import { useAccess } from '@/features/auth/hooks/use-access';
import { useCancelTransfer, useReceiveTransfer } from '../api/queries';
import { TRANSFER_TONE } from '../lib/stock';
import { useMyLocations } from '../lib/use-locations';

/** INV-005 transfer detail: receive at the destination (with shortages) or cancel in transit. */
export function TransferDetailDialog({
  transfer,
  onOpenChange,
}: {
  transfer: StockTransfer | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation('inventory');
  const locale = localeFor(i18n.language);
  const errorMessage = useErrorMessage();
  const { can } = useAccess();
  const { current, nameOf } = useMyLocations();
  const receive = useReceiveTransfer();
  const cancel = useCancelTransfer();
  const [received, setReceived] = useState<Record<string, number | null>>({});
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [wasOpen, setWasOpen] = useState(transfer);
  if (transfer !== wasOpen) {
    setWasOpen(transfer);
    setReceived(Object.fromEntries((transfer?.lines ?? []).map((l) => [l.productId, l.quantity])));
  }

  const inTransit = transfer?.status === 'IN_TRANSIT';
  // Only the destination receives: the location being operated right now, not any the user can see.
  const canReceive =
    inTransit && can('inventory.transfer') && !!current && current.id === transfer?.toLocationId;
  // …and only the sender cancels (the stock goes back to it).
  const canCancel =
    inTransit && can('inventory.transfer') && !!current && current.id === transfer?.fromLocationId;
  // 0…sent per line; an empty field is not "none arrived" — it has to be typed.
  const gotOf = (productId: string, sent: number) =>
    received[productId] === undefined ? sent : received[productId];
  const invalid = (transfer?.lines ?? []).filter((l) => {
    const got = gotOf(l.productId, l.quantity);
    return got === null || got < 0 || got > l.quantity;
  });
  const short =
    transfer?.lines.reduce(
      (s, l) => s + (l.quantity - Math.min(l.quantity, gotOf(l.productId, l.quantity) ?? 0)),
      0,
    ) ?? 0;

  const doReceive = () =>
    transfer &&
    receive.mutate(
      {
        id: transfer.id,
        body: {
          lines: transfer.lines.map((l) => ({
            productId: l.productId,
            receivedQuantity: gotOf(l.productId, l.quantity) ?? 0,
          })),
        },
      },
      {
        onSuccess: (trf) => {
          toast.success(t('transfer.receivedToast', { number: trf.number }));
          onOpenChange(false);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <ResponsiveDialog
      open={!!transfer}
      onOpenChange={onOpenChange}
      title={transfer ? t('transfer.detailTitle', { number: transfer.number }) : ' '}
      description={
        transfer
          ? `${nameOf(transfer.fromLocationId)} → ${nameOf(transfer.toLocationId)}`
          : undefined
      }
      closeLabel={t('close')}
      size="lg"
      footer={
        <>
          {canCancel && (
            <Button
              variant="outline"
              size="pos"
              className="text-destructive"
              onClick={() => setConfirmCancel(true)}
            >
              {t('transfer.cancel')}
            </Button>
          )}
          {canReceive && (
            <Button
              size="pos"
              loading={receive.isPending}
              disabled={invalid.length > 0}
              onClick={doReceive}
            >
              {short > 0 ? t('transfer.receiveShort', { count: short }) : t('transfer.receive')}
            </Button>
          )}
        </>
      }
    >
      {transfer && (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={TRANSFER_TONE[transfer.status]} size="sm">
              {t(`transferStatus.${transfer.status}`)}
            </StatusBadge>
            <span className="text-muted-foreground">
              {t('transfer.dispatchedBy', {
                name: transfer.dispatchedBy,
                at: formatDateTime(transfer.dispatchedAt, { locale }),
              })}
            </span>
            {transfer.receivedBy && transfer.receivedAt && (
              <span className="text-muted-foreground">
                ·{' '}
                {t('transfer.receivedBy', {
                  name: transfer.receivedBy,
                  at: formatDateTime(transfer.receivedAt, { locale }),
                })}
              </span>
            )}
            {transfer.cancelledBy && (
              <span className="text-muted-foreground">
                · {t('transfer.cancelledBy', { name: transfer.cancelledBy })}
              </span>
            )}
          </div>
          {transfer.note && <p className="rounded-lg bg-muted/60 px-3 py-2">{transfer.note}</p>}
          <ul className="divide-y rounded-xl border" aria-label={t('transfer.lines')}>
            {transfer.lines.map((l) => {
              const got = gotOf(l.productId, l.quantity);
              const bad = invalid.includes(l);
              const errorId = `trf-got-${l.productId}`;
              return (
                <li key={l.productId} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{l.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('transfer.sent', {
                        count: l.quantity,
                        unit: t(`unit.${l.unit}`, { count: l.quantity }),
                      })}
                      {l.receivedQuantity !== undefined &&
                        ` · ${t('transfer.got', { count: l.receivedQuantity })}`}
                      {l.receivedQuantity !== undefined && l.receivedQuantity < l.quantity && (
                        <span className="font-medium text-destructive">
                          {' '}
                          · {t('transfer.shortBy', { count: l.quantity - l.receivedQuantity })}
                        </span>
                      )}
                    </p>
                    {canReceive && bad && (
                      <p id={errorId} className="text-xs font-medium text-destructive">
                        {got === null
                          ? t('transfer.receivedRequired')
                          : t('transfer.receivedMax', { count: l.quantity })}
                      </p>
                    )}
                  </div>
                  {canReceive && (
                    <NumberInput
                      value={got}
                      min={0}
                      max={l.quantity}
                      onChange={(q) => setReceived((r) => ({ ...r, [l.productId]: q }))}
                      className="w-36"
                      aria-label={t('transfer.receivedFor', { name: l.name })}
                      aria-invalid={bad}
                      aria-describedby={bad ? errorId : undefined}
                      decrementLabel={t('transfer.less', { name: l.name })}
                      incrementLabel={t('transfer.more', { name: l.name })}
                    />
                  )}
                </li>
              );
            })}
          </ul>
          {canReceive && short > 0 && (
            <p role="status" className="rounded-lg bg-status-warning/10 px-3 py-2 font-medium">
              {t('transfer.shortWarning', { count: short })}
            </p>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={t('transfer.cancelTitle', { number: transfer?.number ?? '' })}
        description={t('transfer.cancelDescription')}
        confirmLabel={t('transfer.cancel')}
        cancelLabel={t('transfer.keep')}
        destructive
        onConfirm={() =>
          transfer &&
          cancel.mutate(transfer.id, {
            onSuccess: (trf) => {
              toast.success(t('transfer.cancelledToast', { number: trf.number }));
              setConfirmCancel(false);
              onOpenChange(false);
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </ResponsiveDialog>
  );
}
