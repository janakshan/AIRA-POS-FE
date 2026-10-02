import type { StockLevel } from '@rbp/types';
import { Button, NumberInput, ResponsiveDialog, toast } from '@rbp/ui';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '@/components/use-error-message';
import { useSetMinStock } from '../api/queries';
import { useMyLocations } from '../lib/use-locations';

/** INV-002/006: minimum stock that triggers the low-stock alert (0 = no alert). */
export function MinStockDialog({
  level,
  onOpenChange,
}: {
  level: StockLevel | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('inventory');
  const errorMessage = useErrorMessage();
  const { nameOf } = useMyLocations();
  const save = useSetMinStock();
  const id = useId();
  const [value, setValue] = useState<number | null>(null);
  const [wasOpen, setWasOpen] = useState(level);
  if (level !== wasOpen) {
    setWasOpen(level);
    setValue(level?.minStock ?? null);
  }

  return (
    <ResponsiveDialog
      open={!!level}
      onOpenChange={onOpenChange}
      title={level ? t('min.title', { name: level.name }) : ' '}
      description={level ? t('min.hint', { location: nameOf(level.locationId) }) : undefined}
      closeLabel={t('close')}
      size="sm"
      footer={
        <Button
          size="pos"
          className="w-full sm:w-auto"
          loading={save.isPending}
          disabled={value === null || value < 0}
          onClick={() =>
            level &&
            value !== null &&
            save.mutate(
              { productId: level.productId, locationId: level.locationId, minStock: value },
              {
                onSuccess: (l) => {
                  toast.success(t('min.saved', { name: l.name, count: l.minStock }));
                  onOpenChange(false);
                },
                onError: (e) => toast.error(errorMessage(e)),
              },
            )
          }
        >
          {t('min.save')}
        </Button>
      }
    >
      {level && (
        <div className="space-y-1.5">
          <label htmlFor={id} className="text-sm font-medium">
            {t('min.label', { unit: t(`unit.${level.unit}`, { count: 2 }) })}
          </label>
          <NumberInput
            id={id}
            value={value}
            onChange={setValue}
            min={0}
            max={100000}
            decrementLabel={t('min.decrease')}
            incrementLabel={t('min.increase')}
          />
          <p className="text-xs text-muted-foreground">
            {t('min.onHand', {
              count: level.onHand,
              unit: t(`unit.${level.unit}`, { count: level.onHand }),
            })}
          </p>
        </div>
      )}
    </ResponsiveDialog>
  );
}
