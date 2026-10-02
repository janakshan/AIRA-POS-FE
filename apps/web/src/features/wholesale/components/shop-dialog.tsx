import type { Money, WholesaleShop } from '@rbp/types';
import {
  Button,
  Input,
  MoneyInput,
  NumberInput,
  ResponsiveDialog,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@rbp/ui';
import { toFieldErrors, wholesaleShopSchema } from '@rbp/validation';
import { isApiError } from '@rbp/api-client';
import { type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '@/components/use-error-message';
import { useSaveShop, useWholesaleRoutes } from '../api/queries';

const NO_ROUTE = 'none';

/** WHO-001/002 add or edit an external shop (§25). One phone here; more come later. */
export function ShopDialog({
  open,
  onOpenChange,
  shop,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shop?: WholesaleShop | null;
  onSaved?: (shop: WholesaleShop) => void;
}) {
  const { t } = useTranslation('wholesale');
  const errorMessage = useErrorMessage();
  const routes = useWholesaleRoutes();
  const save = useSaveShop();
  const ids = {
    name: useId(),
    owner: useId(),
    phone: useId(),
    address: useId(),
    area: useId(),
    route: useId(),
    limit: useId(),
    terms: useId(),
    notes: useId(),
  };
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [area, setArea] = useState('');
  const [routeId, setRouteId] = useState(NO_ROUTE);
  const [limit, setLimit] = useState<Money | null>(null);
  const [terms, setTerms] = useState<number | null>(14);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(shop?.name ?? '');
      setOwnerName(shop?.ownerName ?? '');
      setPhone(shop?.phones.find((p) => p.primary)?.number ?? '');
      setAddress(shop?.address ?? '');
      setArea(shop?.area ?? '');
      setRouteId(shop?.routeId ?? NO_ROUTE);
      setLimit(shop?.creditLimit ?? { amount: 1_000_000, currency: 'LKR' });
      setTerms(shop?.paymentTermsDays ?? 14);
      setNotes(shop?.notes ?? '');
      setErrors({});
    }
  }

  const submit = () => {
    const body = {
      name,
      ...(ownerName.trim() ? { ownerName } : {}),
      phones: [{ number: phone, primary: true }],
      ...(address.trim() ? { address } : {}),
      ...(area.trim() ? { area } : {}),
      routeId: routeId === NO_ROUTE ? null : routeId,
      creditLimit: limit?.amount ?? 0,
      paymentTermsDays: terms ?? 0,
      ...(notes.trim() ? { notes } : {}),
      ...(shop ? { isActive: shop.isActive } : {}),
    };
    const parsed = wholesaleShopSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(flatten(toFieldErrors(parsed.error)));
      return;
    }
    setErrors({});
    save.mutate(
      { ...(shop ? { id: shop.id } : {}), body: parsed.data },
      {
        onSuccess: (s) => {
          toast.success(t(shop ? 'shopForm.updated' : 'shopForm.created', { name: s.name }));
          onOpenChange(false);
          onSaved?.(s);
        },
        onError: (e) => {
          const fe = isApiError(e) ? e.details?.fieldErrors : undefined;
          if (fe && typeof fe === 'object') setErrors(flatten(fe as Record<string, string>));
          toast.error(errorMessage(e));
        },
      },
    );
  };

  const field = (id: string, key: string, label: string, control: ReactNode) => (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {control}
      {errors[key] && (
        <p className="text-xs text-status-danger-fg" role="alert">
          {t(`common:${errors[key]}`)}
        </p>
      )}
    </div>
  );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !save.isPending && onOpenChange(o)}
      title={shop ? t('shopForm.editTitle', { name: shop.name }) : t('shopForm.newTitle')}
      description={t('shopForm.hint')}
      closeLabel={t('close')}
      size="lg"
      footer={
        <Button size="pos" className="w-full sm:w-auto" loading={save.isPending} onClick={submit}>
          {t('shopForm.save')}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {field(
          ids.name,
          'name',
          t('fields.shopName'),
          <Input
            id={ids.name}
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />,
        )}
        {field(
          ids.owner,
          'ownerName',
          t('fields.owner'),
          <Input
            id={ids.owner}
            value={ownerName}
            maxLength={80}
            onChange={(e) => setOwnerName(e.target.value)}
          />,
        )}
        {field(
          ids.phone,
          'phones',
          t('fields.phone'),
          <Input
            id={ids.phone}
            type="tel"
            inputMode="tel"
            value={phone}
            placeholder="077 123 4567"
            onChange={(e) => setPhone(e.target.value)}
          />,
        )}
        {field(
          ids.route,
          'routeId',
          t('fields.route'),
          <Select value={routeId} onValueChange={setRouteId}>
            <SelectTrigger id={ids.route} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_ROUTE}>{t('shopForm.noRoute')}</SelectItem>
              {routes.data?.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>,
        )}
        {field(
          ids.address,
          'address',
          t('fields.address'),
          <Input
            id={ids.address}
            value={address}
            maxLength={200}
            onChange={(e) => setAddress(e.target.value)}
          />,
        )}
        {field(
          ids.area,
          'area',
          t('fields.area'),
          <Input
            id={ids.area}
            value={area}
            maxLength={60}
            onChange={(e) => setArea(e.target.value)}
          />,
        )}
        {field(
          ids.limit,
          'creditLimit',
          t('fields.creditLimit'),
          <MoneyInput
            id={ids.limit}
            value={limit}
            onChange={setLimit}
            currency="LKR"
            symbol="Rs"
          />,
        )}
        {field(
          ids.terms,
          'paymentTermsDays',
          t('fields.terms'),
          <NumberInput
            id={ids.terms}
            value={terms}
            min={0}
            max={120}
            onChange={setTerms}
            decrementLabel={t('shopForm.fewerDays')}
            incrementLabel={t('shopForm.moreDays')}
          />,
        )}
        <div className="sm:col-span-2">
          {field(
            ids.notes,
            'notes',
            t('fields.notes'),
            <Textarea
              id={ids.notes}
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />,
          )}
        </div>
      </div>
    </ResponsiveDialog>
  );
}

/** `phones.0.number` → `phones`. */
function flatten(fieldErrors: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [path, message] of Object.entries(fieldErrors)) {
    const key = path.split('.')[0] ?? path;
    out[key] ??= message;
  }
  return out;
}
