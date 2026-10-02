import type { ProductionBatch } from '@rbp/types';
import { Alert, Button, NumberInput, ResponsiveDialog, toast } from '@rbp/ui';
import { cn } from '@rbp/utils';
import { PlayIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '@/components/use-error-message';
import { useStartBatch } from '../api/queries';

/**
 * BAK-003 start a batch: the raw materials it uses leave stock now (PRODUCTION_CONSUMPTION).
 * Quantities default to the formula; the baker records what was actually used.
 */
export function StartBatchDialog({
  batch,
  onOpenChange,
}: {
  batch: ProductionBatch | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('production');
  const errorMessage = useErrorMessage();
  const start = useStartBatch();
  const [used, setUsed] = useState<Record<string, number | null>>({});
  const [was, setWas] = useState(batch);
  if (batch !== was) {
    setWas(batch);
    setUsed({});
  }
  const lines = (batch?.consumption ?? []).map((c) => {
    const entered = used[c.ingredientId];
    const quantity = entered === undefined ? c.plannedQuantity : entered;
    return { ...c, quantity, short: (quantity ?? 0) > Math.max(0, c.onHand) };
  });
  const short = lines.filter((l) => l.short);
  const valid = lines.every((l) => l.quantity !== null && l.quantity >= 0) && !short.length;

  const submit = () =>
    batch &&
    start.mutate(
      {
        id: batch.id,
        body: {
          consumption: lines.map((l) => ({
            ingredientId: l.ingredientId,
            quantity: l.quantity ?? 0,
          })),
        },
      },
      {
        onSuccess: (b) => {
          toast.success(t('start.done', { number: b.number, name: b.productName }));
          onOpenChange(false);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <ResponsiveDialog
      open={!!batch}
      onOpenChange={(o) => !start.isPending && onOpenChange(o)}
      title={t('start.title', { number: batch?.number ?? '', name: batch?.productName ?? '' })}
      description={t('start.hint', {
        count: batch?.runs ?? 0,
        expected: batch?.expectedQuantity ?? 0,
      })}
      closeLabel={t('close')}
      size="lg"
      footer={
        <Button
          size="pos"
          className="w-full sm:w-auto"
          disabled={!valid}
          loading={start.isPending}
          onClick={submit}
        >
          <PlayIcon /> {t('start.confirm')}
        </Button>
      }
    >
      <div className="space-y-4">
        {short.length > 0 && (
          <Alert tone="warning" title={t('start.short')}>
            {short.map((l) => `${l.name} (${Math.max(0, l.onHand)})`).join(', ')}
          </Alert>
        )}
        <table className="w-full text-sm">
          <caption className="sr-only">{t('start.materials')}</caption>
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground uppercase">
              <th scope="col" className="py-2 font-medium">
                {t('fields.material')}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {t('fields.formula')}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {t('fields.onHand')}
              </th>
              <th scope="col" className="w-40 py-2 text-right font-medium">
                {t('fields.used')}
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.ingredientId} className="border-b last:border-0">
                <th scope="row" className="py-2 text-left font-medium">
                  {l.name}
                  <span className="block text-xs font-normal text-muted-foreground">
                    {t(`inventory:unit.${l.unit}`, { count: 2 })}
                  </span>
                </th>
                <td className="py-2 text-right tabular">{l.plannedQuantity}</td>
                <td
                  className={cn(
                    'py-2 text-right tabular',
                    l.short && 'font-semibold text-status-danger-fg',
                  )}
                >
                  {l.onHand}
                </td>
                <td className="py-2 pl-2">
                  <NumberInput
                    value={l.quantity}
                    min={0}
                    max={10000}
                    onChange={(v) => setUsed((u) => ({ ...u, [l.ingredientId]: v }))}
                    aria-label={t('start.usedOf', { name: l.name })}
                    decrementLabel={t('start.lessOf', { name: l.name })}
                    incrementLabel={t('start.moreOf', { name: l.name })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ResponsiveDialog>
  );
}
