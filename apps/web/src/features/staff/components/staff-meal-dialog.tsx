import { queryKeys } from '@rbp/api-client';
import type { Money, StaffMeal } from '@rbp/types';
import {
  Button,
  NumberInput,
  ResponsiveDialog,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@rbp/ui';
import { formatMoney } from '@rbp/utils';
import { PlusIcon, Trash2Icon, UtensilsIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { useErrorMessage } from '@/components/use-error-message';
import { useQueryScope } from '@/features/auth/hooks/use-query-scope';
import { useSensitiveAction } from '@/features/auth/hooks/use-sensitive-action';
import { useLocationProducts } from '@/features/catalog/api/queries';
import { api } from '@/lib/api';
import { useCreateStaffMeal } from '../api/queries';

export interface MealLineDraft {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: Money;
}

/** Employees who work at a location (summary; no staff.view needed — the counter uses it). */
function useLocationEmployees(locationId: string, enabled: boolean) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.employees(scope, locationId),
    queryFn: ({ signal }) => api.employees.list(locationId, signal),
    enabled: ready && enabled && !!locationId,
  });
}

/**
 * HR-005 / POS staff meal (§22): who ate what, valued at the sale price, approved with a
 * manager PIN. No payment — the food still leaves stock and counts against the allowance.
 * From the POS the items come from the cart; on HR-005 they're picked here.
 */
export function StaffMealDialog({
  open,
  onOpenChange,
  locationId,
  lines: fixedLines,
  source,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId: string;
  /** POS: the cart's items (read-only here). */
  lines?: MealLineDraft[];
  source: 'HR' | 'POS';
  onDone?: (meal: StaffMeal) => void;
}) {
  const { t, i18n } = useTranslation('staff');
  const locale = localeFor(i18n.language);
  const errorMessage = useErrorMessage();
  const confirmSensitive = useSensitiveAction();
  const create = useCreateStaffMeal();
  const employees = useLocationEmployees(locationId, open);
  const products = useLocationProducts({ locationId });
  const ids = { employee: useId(), product: useId() };
  const [employeeId, setEmployeeId] = useState('');
  const [picked, setPicked] = useState<MealLineDraft[]>([]);
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState<number | null>(1);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setEmployeeId('');
      setPicked([]);
      setProductId('');
      setQty(1);
    }
  }
  const lines = fixedLines ?? picked;
  const value = lines.reduce((s, l) => s + l.unitPrice.amount * l.quantity, 0);
  const currency = lines[0]?.unitPrice.currency ?? 'LKR';
  const employee = employees.data?.find((e) => e.id === employeeId);
  const sellable = products.data?.filter((p) => p.enabled && p.isAvailable) ?? [];

  const add = () => {
    const p = sellable.find((x) => x.productId === productId);
    if (!p || !qty) return;
    setPicked((ls) =>
      ls.some((l) => l.productId === p.productId)
        ? ls.map((l) => (l.productId === p.productId ? { ...l, quantity: l.quantity + qty } : l))
        : [...ls, { productId: p.productId, name: p.name, quantity: qty, unitPrice: p.price }],
    );
    setProductId('');
    setQty(1);
  };

  const submit = async () => {
    if (!employee || !lines.length) return;
    const verification = await confirmSensitive('staff.meal', {
      reasonTitle: t('meal.reasonTitle', { name: employee.fullName }),
      reasonDescription: t('meal.reasonDescription'),
      summary: `${employee.fullName} · ${lines.map((l) => `${l.name} ×${l.quantity}`).join(', ')} · ${formatMoney({ amount: value, currency }, locale)}`,
    });
    if (!verification) return;
    create.mutate(
      {
        employeeId: employee.id,
        locationId,
        lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        source,
        verification,
      },
      {
        onSuccess: (meal) => {
          toast.success(
            t('meal.done', {
              number: meal.number,
              name: meal.employeeName,
              value: formatMoney(meal.value, locale),
            }),
          );
          onOpenChange(false);
          onDone?.(meal);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !create.isPending && onOpenChange(o)}
      title={t('meal.title')}
      description={t('meal.hint')}
      closeLabel={t('close')}
      size="md"
      footer={
        <Button
          size="pos"
          className="w-full sm:w-auto"
          disabled={!employee || !lines.length || create.isPending}
          loading={create.isPending}
          onClick={() => void submit()}
        >
          <UtensilsIcon />{' '}
          {t('meal.confirm', { value: formatMoney({ amount: value, currency }, locale) })}
        </Button>
      }
    >
      <div data-screen-id="HR-005" className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor={ids.employee} className="text-sm font-medium">
            {t('meal.employee')}
          </label>
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger id={ids.employee} className="w-full">
              <SelectValue placeholder={t('meal.pickEmployee')} />
            </SelectTrigger>
            <SelectContent>
              {employees.data?.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.fullName} · {e.jobTitle}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!fixedLines && (
          <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
            <div className="space-y-1.5">
              <label htmlFor={ids.product} className="text-sm font-medium">
                {t('meal.item')}
              </label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger id={ids.product} className="w-full">
                  <SelectValue placeholder={t('meal.pickItem')} />
                </SelectTrigger>
                <SelectContent>
                  {sellable.map((p) => (
                    <SelectItem key={p.productId} value={p.productId}>
                      {p.name} · {formatMoney(p.price, locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <NumberInput
              value={qty}
              min={1}
              max={50}
              onChange={setQty}
              aria-label={t('meal.qty')}
              decrementLabel={t('meal.less')}
              incrementLabel={t('meal.more')}
            />
            <Button variant="outline" disabled={!productId || !qty} onClick={add}>
              <PlusIcon /> {t('meal.add')}
            </Button>
          </div>
        )}

        <ul className="divide-y rounded-xl border text-sm" aria-label={t('meal.items')}>
          {!lines.length && (
            <li className="px-3 py-3 text-muted-foreground">{t('meal.noItems')}</li>
          )}
          {lines.map((l) => (
            <li key={l.productId} className="flex items-center justify-between gap-2 px-3 py-2">
              <span>
                {l.quantity} × {l.name}
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular">
                  {formatMoney({ amount: l.unitPrice.amount * l.quantity, currency }, locale)}
                </span>
                {!fixedLines && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="pointer-coarse:size-11"
                    aria-label={t('meal.remove', { name: l.name })}
                    onClick={() => setPicked((ls) => ls.filter((x) => x.productId !== l.productId))}
                  >
                    <Trash2Icon />
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">{t('meal.noPayment')}</p>
      </div>
    </ResponsiveDialog>
  );
}
