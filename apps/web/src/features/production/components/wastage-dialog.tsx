import type { FinishedGoodsItem } from '@rbp/types';
import { Button, Input, NumberInput, ResponsiveDialog, toast } from '@rbp/ui';
import { Trash2Icon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '@/components/use-error-message';
import { useSensitiveAction } from '@/features/auth/hooks/use-sensitive-action';
import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { useCreateWastage } from '../api/queries';

/**
 * BAK-004/005 write off finished bakery goods (expired, damaged…): quantity → employee PIN →
 * reason → WASTAGE movement + audit.
 */
export function WastageDialog({
  item,
  onOpenChange,
}: {
  item: FinishedGoodsItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('production');
  const errorMessage = useErrorMessage();
  const confirmSensitive = useSensitiveAction();
  const create = useCreateWastage();
  const { nameOf } = useMyLocations();
  const ids = { qty: useId(), note: useId() };
  const [qty, setQty] = useState<number | null>(1);
  const [note, setNote] = useState('');
  const [was, setWas] = useState(item);
  if (item !== was) {
    setWas(item);
    setQty(1);
    setNote('');
  }
  const onHand = item?.onHand ?? 0;
  const valid = qty !== null && qty >= 1 && qty <= onHand;
  const unit = (n: number) => (item ? t(`inventory:unit.${item.unit}`, { count: n }) : '');

  const submit = async () => {
    if (!item || !valid || qty === null) return;
    const verification = await confirmSensitive('production.wastage', {
      reasonTitle: t('wastageDialog.reasonTitle', { name: item.name }),
      reasonDescription: t('wastageDialog.reasonDescription'),
      summary: `${item.name} @ ${nameOf(item.locationId)} · ${t('wastageDialog.writeOff', { count: qty })}`,
      change: {
        before: `${onHand} ${unit(onHand)}`,
        after: `${onHand - qty} ${unit(onHand - qty)}`,
      },
    });
    if (!verification) return;
    create.mutate(
      {
        locationId: item.locationId,
        productId: item.productId,
        quantity: qty,
        ...(note.trim() ? { note: note.trim() } : {}),
        verification,
      },
      {
        onSuccess: (w) => {
          toast.success(
            t('wastageDialog.done', { number: w.number, count: w.quantity, name: w.productName }),
          );
          onOpenChange(false);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  return (
    <ResponsiveDialog
      open={!!item}
      onOpenChange={(o) => !create.isPending && onOpenChange(o)}
      title={t('wastageDialog.title', { name: item?.name ?? '' })}
      description={t('wastageDialog.hint', {
        count: onHand,
        unit: unit(onHand),
        location: nameOf(item?.locationId),
      })}
      closeLabel={t('close')}
      size="md"
      footer={
        <Button
          size="pos"
          className="w-full sm:w-auto"
          disabled={!valid || create.isPending}
          loading={create.isPending}
          onClick={() => void submit()}
        >
          <Trash2Icon /> {t('wastageDialog.confirm')}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor={ids.qty} className="text-sm font-medium">
            {t('wastageDialog.quantity')}
          </label>
          <NumberInput
            id={ids.qty}
            value={qty}
            min={1}
            max={Math.max(1, onHand)}
            onChange={setQty}
            decrementLabel={t('wastageDialog.less')}
            incrementLabel={t('wastageDialog.more')}
          />
          {qty !== null && qty > onHand && (
            <p className="text-sm text-status-danger-fg">{t('wastageDialog.tooMany')}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <label htmlFor={ids.note} className="text-sm font-medium">
            {t('fields.note')}
          </label>
          <Input
            id={ids.note}
            maxLength={200}
            value={note}
            placeholder={t('wastageDialog.notePlaceholder')}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
    </ResponsiveDialog>
  );
}
