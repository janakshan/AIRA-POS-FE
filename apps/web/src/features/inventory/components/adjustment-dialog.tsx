import type { StockAdjustmentKind, StockLevel } from '@rbp/types';
import { Button, NumericKeypad, RadioCard, RadioGroup, ResponsiveDialog, toast } from '@rbp/ui';
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  ClipboardCheckIcon,
  Trash2Icon,
  UtensilsIcon,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '@/components/use-error-message';
import { useSensitiveAction } from '@/features/auth/hooks/use-sensitive-action';
import { useCreateAdjustment } from '../api/queries';
import { resultOf } from '../lib/stock';
import { useMyLocations } from '../lib/use-locations';
import { ItemPicker } from './item-picker';
import { LocationSelect } from './location-select';

const KINDS: { kind: StockAdjustmentKind; icon: ReactNode }[] = [
  { kind: 'COUNT', icon: <ClipboardCheckIcon /> },
  { kind: 'ADD', icon: <ArrowUpIcon /> },
  { kind: 'REMOVE', icon: <ArrowDownIcon /> },
  { kind: 'WASTAGE', icon: <Trash2Icon /> },
  { kind: 'STAFF_MEAL', icon: <UtensilsIcon /> },
];

type Step = 'item' | 'kind' | 'quantity';

/**
 * INV-004 / FLOW-INV-001: Item → Adjustment → Quantity → Employee verification (PIN) →
 * Reason → stock movement → audit.
 */
export function AdjustmentDialog({
  open,
  onOpenChange,
  locationId: initialLocation,
  item,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId?: string;
  /** Start at step 2 for this item (from INV-002 / INV-006). */
  item?: StockLevel | null;
}) {
  const { t } = useTranslation('inventory');
  const errorMessage = useErrorMessage();
  const confirmSensitive = useSensitiveAction();
  const create = useCreateAdjustment();
  const { current, nameOf } = useMyLocations();
  const [step, setStep] = useState<Step>('item');
  const [locationId, setLocationId] = useState('');
  const [picked, setPicked] = useState<StockLevel | null>(null);
  const [kind, setKind] = useState<StockAdjustmentKind>('COUNT');
  const [qty, setQty] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setLocationId(item?.locationId ?? initialLocation ?? current?.id ?? '');
      setPicked(item ?? null);
      setStep(item ? 'kind' : 'item');
      setKind('COUNT');
      setQty('');
    }
  }

  const quantity = qty ? Number(qty) : NaN;
  const onHand = picked?.onHand ?? 0;
  const after = Number.isFinite(quantity) ? resultOf(kind, onHand, quantity) : onHand;
  const unit = (n: number) => (picked ? t(`unit.${picked.unit}`, { count: n }) : '');
  const valid =
    Number.isFinite(quantity) &&
    (kind === 'COUNT' ? quantity >= 0 && quantity !== onHand : quantity > 0) &&
    after >= 0;

  const submit = async () => {
    if (!picked || !valid) return;
    const kindLabel = t(`kind.${kind}`);
    const verification = await confirmSensitive('inventory.adjust', {
      reasonTitle: t('adjust.reasonTitle', { name: picked.name }),
      reasonDescription: t('adjust.reasonDescription'),
      summary: `${picked.name} @ ${nameOf(locationId)} · ${kindLabel}`,
      change: { before: `${onHand} ${unit(onHand)}`, after: `${after} ${unit(after)}` },
    });
    if (!verification) return;
    create.mutate(
      { locationId, productId: picked.productId, kind, quantity, verification },
      {
        onSuccess: (adj) => {
          toast.success(
            t('adjust.done', {
              number: adj.number,
              name: adj.productName,
              before: adj.before,
              after: adj.after,
            }),
          );
          onOpenChange(false);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  const back = step === 'quantity' ? 'kind' : step === 'kind' && !item ? 'item' : null;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !create.isPending && onOpenChange(o)}
      title={
        picked && step !== 'item' ? t('adjust.titleFor', { name: picked.name }) : t('adjust.title')
      }
      description={t(`adjust.step.${step}`, { location: nameOf(locationId) })}
      closeLabel={t('close')}
      size="lg"
      footer={
        <>
          {back && (
            <Button variant="outline" size="pos" onClick={() => setStep(back)}>
              <ArrowLeftIcon /> {t('adjust.back')}
            </Button>
          )}
          {step === 'kind' && (
            <Button size="pos" onClick={() => setStep('quantity')}>
              {t('adjust.next')}
            </Button>
          )}
          {step === 'quantity' && (
            <Button
              size="pos"
              disabled={!valid || create.isPending}
              loading={create.isPending}
              onClick={() => void submit()}
            >
              {t('adjust.confirm')}
            </Button>
          )}
        </>
      }
    >
      <div data-screen-id="INV-004" className="space-y-4">
        {step === 'item' && (
          <>
            <LocationSelect value={locationId} onChange={setLocationId} label={t('location')} />
            {locationId && (
              <ItemPicker
                locationId={locationId}
                onPick={(level) => {
                  setPicked(level);
                  setStep('kind');
                }}
              />
            )}
          </>
        )}
        {step === 'kind' && picked && (
          <>
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
              {t('adjust.onHand', {
                count: onHand,
                unit: unit(onHand),
                location: nameOf(locationId),
              })}
            </p>
            <RadioGroup
              value={kind}
              onValueChange={(v) => setKind(v as StockAdjustmentKind)}
              aria-label={t('adjust.kindLabel')}
              className="grid gap-2 sm:grid-cols-2"
            >
              {KINDS.map((k) => (
                <RadioCard
                  key={k.kind}
                  value={k.kind}
                  icon={k.icon}
                  title={t(`kind.${k.kind}`)}
                  description={t(`kind.${k.kind}_hint`)}
                />
              ))}
            </RadioGroup>
          </>
        )}
        {step === 'quantity' && picked && (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="space-y-3">
              <p className="text-sm font-medium">
                {kind === 'COUNT'
                  ? t('adjust.countedLabel')
                  : t('adjust.quantityLabel', { kind: t(`kind.${kind}`) })}
              </p>
              <div
                aria-live="polite"
                className={
                  after < 0
                    ? 'rounded-xl bg-destructive/10 px-4 py-3'
                    : 'rounded-xl bg-muted/60 px-4 py-3'
                }
              >
                <p className="text-sm text-muted-foreground">{t('adjust.preview')}</p>
                <p className="text-2xl font-bold tabular">
                  {onHand} → {after} <span className="text-base font-normal">{unit(after)}</span>
                </p>
                {after < 0 && (
                  <p className="text-sm font-medium text-destructive">{t('adjust.belowZero')}</p>
                )}
                {kind === 'COUNT' && Number.isFinite(quantity) && quantity === onHand && (
                  <p className="text-sm text-muted-foreground">{t('adjust.noChange')}</p>
                )}
              </div>
            </div>
            <NumericKeypad
              value={qty}
              onChange={setQty}
              mode="integer"
              maxLength={6}
              label={t('adjust.quantity')}
              display={qty || '0'}
            />
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}
