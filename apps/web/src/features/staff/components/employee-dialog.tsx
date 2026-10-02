import { isApiError } from '@rbp/api-client';
import type { EmployeeView, Money } from '@rbp/types';
import { Button, Checkbox, Input, MoneyInput, ResponsiveDialog, toast } from '@rbp/ui';
import { employeeSchema, toFieldErrors } from '@rbp/validation';
import { type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '@/components/use-error-message';
import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { useSaveEmployee } from '../api/queries';

/** HR-001/002 add or edit an employee: locations, PIN (set / reset) and food allowance. */
export function EmployeeDialog({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee?: EmployeeView | null;
}) {
  const { t } = useTranslation('staff');
  const errorMessage = useErrorMessage();
  const { locations } = useMyLocations();
  const save = useSaveEmployee();
  const ids = { name: useId(), title: useId(), phone: useId(), pin: useId(), allowance: useId() };
  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [allowance, setAllowance] = useState<Money | null>(null);
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFullName(employee?.fullName ?? '');
      setJobTitle(employee?.jobTitle ?? '');
      setPhone(employee?.phone ?? '');
      setPin('');
      setAllowance(employee?.monthlyFoodAllowance ?? { amount: 500_000, currency: 'LKR' });
      setLocationIds(employee?.locationIds ?? []);
      setActive(employee?.isActive ?? true);
      setErrors({});
    }
  }

  const submit = () => {
    const body = {
      fullName,
      jobTitle,
      ...(phone.trim() ? { phone } : {}),
      locationIds,
      ...(pin ? { pin } : {}),
      monthlyFoodAllowance: allowance?.amount ?? 0,
      isActive: active,
    };
    const parsed = employeeSchema.safeParse(body);
    const errs: Record<string, string> = parsed.success ? {} : toFieldErrors(parsed.error);
    if (!employee && !pin) errs.pin = 'validation.pinFormat';
    if (Object.keys(errs).length || !parsed.success) {
      setErrors(errs);
      return;
    }
    setErrors({});
    save.mutate(
      { ...(employee ? { id: employee.id } : {}), body: parsed.data },
      {
        onSuccess: (e) => {
          toast.success(
            t(employee ? 'employeeForm.updated' : 'employeeForm.created', { name: e.fullName }),
          );
          onOpenChange(false);
        },
        onError: (e) => {
          const fe = isApiError(e) ? e.details?.fieldErrors : undefined;
          if (fe && typeof fe === 'object') setErrors(fe as Record<string, string>);
          toast.error(errorMessage(e));
        },
      },
    );
  };

  const field = (id: string, key: string, label: string, control: ReactNode, hint?: string) => (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {control}
      {errors[key] ? (
        <p className="text-xs text-status-danger-fg" role="alert">
          {t(`common:${errors[key]}`)}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !save.isPending && onOpenChange(o)}
      title={
        employee
          ? t('employeeForm.editTitle', { name: employee.fullName })
          : t('employeeForm.newTitle')
      }
      closeLabel={t('close')}
      size="lg"
      footer={
        <Button size="pos" className="w-full sm:w-auto" loading={save.isPending} onClick={submit}>
          {t('employeeForm.save')}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {field(
          ids.name,
          'fullName',
          t('fields.name'),
          <Input
            id={ids.name}
            value={fullName}
            maxLength={80}
            onChange={(e) => setFullName(e.target.value)}
          />,
        )}
        {field(
          ids.title,
          'jobTitle',
          t('fields.jobTitle'),
          <Input
            id={ids.title}
            value={jobTitle}
            maxLength={40}
            onChange={(e) => setJobTitle(e.target.value)}
          />,
        )}
        {field(
          ids.phone,
          'phone',
          t('fields.phone'),
          <Input
            id={ids.phone}
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />,
        )}
        {field(
          ids.pin,
          'pin',
          employee ? t('employeeForm.resetPin') : t('fields.pin'),
          <Input
            id={ids.pin}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          />,
          employee ? t('employeeForm.pinKeep') : t('employeeForm.pinHint'),
        )}
        {field(
          ids.allowance,
          'monthlyFoodAllowance',
          t('fields.allowance'),
          <MoneyInput
            id={ids.allowance}
            value={allowance}
            onChange={setAllowance}
            currency="LKR"
            symbol="Rs"
          />,
          t('employeeForm.allowanceHint'),
        )}
        <fieldset className="space-y-2 sm:col-span-2">
          <legend className="text-sm font-medium">{t('fields.locations')}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {locations.map((l) => (
              <label key={l.id} className="flex items-center gap-2 text-sm pointer-coarse:min-h-11">
                <Checkbox
                  checked={locationIds.includes(l.id)}
                  onCheckedChange={(v) =>
                    setLocationIds((ids) =>
                      v === true ? [...ids, l.id] : ids.filter((x) => x !== l.id),
                    )
                  }
                />
                {l.name}
              </label>
            ))}
          </div>
          {errors.locationIds && (
            <p className="text-xs text-status-danger-fg" role="alert">
              {t(`common:${errors.locationIds}`)}
            </p>
          )}
        </fieldset>
        {employee && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2 pointer-coarse:min-h-11">
            <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} />
            {t('employeeForm.active')}
          </label>
        )}
      </div>
    </ResponsiveDialog>
  );
}
