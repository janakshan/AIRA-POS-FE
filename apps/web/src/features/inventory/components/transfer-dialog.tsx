import type { StockLevel } from '@rbp/types';
import { Button, Input, NumberInput, ResponsiveDialog, toast } from '@rbp/ui';
import { PlusIcon, Trash2Icon, TruckIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '@/components/use-error-message';
import { useCreateTransfer } from '../api/queries';
import { useMyLocations } from '../lib/use-locations';
import { ItemPicker } from './item-picker';
import { LocationSelect } from './location-select';

interface Line {
  productId: string;
  name: string;
  unit: StockLevel['unit'];
  /** Available at the sending location. */
  onHand: number;
  /** Typed or stepped; null while the field is empty. */
  quantity: number | null;
}

/** 1…on hand, whole units (INV-005). */
const lineError = (l: Line) =>
  l.quantity === null || l.quantity < 1 ? 'min' : l.quantity > l.onHand ? 'max' : null;

export interface TransferPrefill {
  fromLocationId?: string;
  toLocationId?: string;
  /** Levels at the sending location. */
  items?: StockLevel[];
  /** Suggested quantity per product (e.g. what a low-stock location is short). */
  quantities?: Record<string, number>;
}

/** INV-005 new transfer: pick items at the sender and dispatch (stock leaves now). */
export function TransferDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: TransferPrefill;
}) {
  const { t } = useTranslation('inventory');
  const errorMessage = useErrorMessage();
  const { current, locations, nameOf } = useMyLocations();
  const create = useCreateTransfer();
  const noteId = useId();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState('');
  const [picking, setPicking] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const f = initial?.fromLocationId ?? current?.id ?? '';
      setFrom(f);
      setTo(initial?.toLocationId ?? locations.find((l) => l.id !== f)?.id ?? '');
      setLines(
        (initial?.items ?? []).map((l) => ({
          productId: l.productId,
          name: l.name,
          unit: l.unit,
          onHand: l.onHand,
          quantity: Math.max(1, Math.min(l.onHand, initial?.quantities?.[l.productId] ?? 1)),
        })),
      );
      setNote('');
      setPicking(!initial?.items?.length);
    }
  }

  const valid = from && to && from !== to && lines.length > 0 && lines.every((l) => !lineError(l));
  const total = lines.reduce((s, l) => s + (l.quantity ?? 0), 0);

  const dispatch = () =>
    create.mutate(
      {
        fromLocationId: from,
        toLocationId: to,
        lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity ?? 0 })),
        ...(note.trim() ? { note: note.trim() } : {}),
      },
      {
        onSuccess: (trf) => {
          toast.success(
            t('transfer.dispatched', { number: trf.number, to: nameOf(trf.toLocationId) }),
          );
          onOpenChange(false);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !create.isPending && onOpenChange(o)}
      title={t('transfer.newTitle')}
      description={t('transfer.newHint')}
      closeLabel={t('close')}
      size="lg"
      footer={
        <Button
          size="pos"
          className="w-full sm:w-auto"
          disabled={!valid || create.isPending}
          loading={create.isPending}
          onClick={dispatch}
        >
          <TruckIcon /> {t('transfer.dispatch', { count: total })}
        </Button>
      }
    >
      <div data-screen-id="INV-005" className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t('transfer.from')}</p>
            <LocationSelect
              value={from}
              onChange={(v) => {
                setFrom(v);
                // Available stock is per location: start the lines again.
                setLines([]);
                setPicking(true);
                if (v === to) setTo(locations.find((l) => l.id !== v)?.id ?? '');
              }}
              label={t('transfer.from')}
              className="w-full"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t('transfer.to')}</p>
            <LocationSelect
              value={to}
              onChange={setTo}
              exclude={from}
              label={t('transfer.to')}
              className="w-full"
            />
          </div>
        </div>

        {lines.length > 0 && (
          <ul className="divide-y rounded-xl border" aria-label={t('transfer.lines')}>
            {lines.map((l) => {
              const error = lineError(l);
              return (
                <li key={l.productId} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{l.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('transfer.available', {
                        count: l.onHand,
                        unit: t(`unit.${l.unit}`, { count: l.onHand }),
                      })}
                    </p>
                    {error && (
                      <p
                        id={`${noteId}-${l.productId}`}
                        className="text-xs font-medium text-destructive"
                      >
                        {error === 'min'
                          ? t('transfer.quantityMin')
                          : t('transfer.quantityMax', { count: l.onHand })}
                      </p>
                    )}
                  </div>
                  {/* Typed entry for big counts (60 pcs is one entry, not 59 taps); clamped on blur. */}
                  <NumberInput
                    value={l.quantity}
                    min={1}
                    max={l.onHand}
                    onChange={(q) =>
                      setLines((ls) =>
                        ls.map((x) => (x.productId === l.productId ? { ...x, quantity: q } : x)),
                      )
                    }
                    className="w-36"
                    aria-label={t('transfer.quantityFor', { name: l.name })}
                    aria-invalid={!!error}
                    aria-describedby={error ? `${noteId}-${l.productId}` : undefined}
                    decrementLabel={t('transfer.less', { name: l.name })}
                    incrementLabel={t('transfer.more', { name: l.name })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-touch text-destructive"
                    onClick={() => setLines((ls) => ls.filter((x) => x.productId !== l.productId))}
                    aria-label={t('transfer.removeLine', { name: l.name })}
                  >
                    <Trash2Icon />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {picking && from ? (
          <ItemPicker
            locationId={from}
            requireStock
            disabledIds={lines.map((l) => l.productId)}
            onPick={(level) => {
              setLines((ls) => [
                ...ls,
                {
                  productId: level.productId,
                  name: level.name,
                  unit: level.unit,
                  onHand: level.onHand,
                  quantity: 1,
                },
              ]);
              setPicking(false);
            }}
          />
        ) : (
          <Button variant="outline" onClick={() => setPicking(true)} disabled={!from}>
            <PlusIcon /> {t('transfer.addItem')}
          </Button>
        )}

        <div className="space-y-1.5">
          <label htmlFor={noteId} className="text-sm font-medium">
            {t('transfer.note')}
          </label>
          <Input
            id={noteId}
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('transfer.notePlaceholder')}
          />
        </div>
      </div>
    </ResponsiveDialog>
  );
}
