import { isApiError } from '@rbp/api-client';
import type { SettingsUser } from '@rbp/types';
import {
  Button,
  Checkbox,
  Input,
  RadioGroup,
  RadioGroupItem,
  ResponsiveDialog,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@rbp/ui';
import { toFieldErrors, userCreateSchema, userSchema } from '@rbp/validation';
import { type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '@/components/use-error-message';
import { useEmployees } from '@/features/audit/api/queries';
import {
  useSaveUser,
  useSettingsLocations,
  useSettingsRoles,
  useSettingsUsers,
} from '../api/queries';

const NONE = '-';

/** SET-003 add or edit a sign-in: roles, which locations it can open, and its employee link. */
export function UserDialog({
  open,
  onOpenChange,
  user,
  employeeId: presetEmployee,
  onResetPassword,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: SettingsUser | null;
  /** Pre-select an employee (from the employee page's "Create sign-in"). */
  employeeId?: string | null;
  onResetPassword?: (user: SettingsUser) => void;
}) {
  const { t } = useTranslation('settings');
  const errorMessage = useErrorMessage();
  const save = useSaveUser();
  const roles = useSettingsRoles();
  const locations = useSettingsLocations();
  const users = useSettingsUsers();
  const employees = useEmployees();
  const ids = { email: useId(), name: useId(), password: useId(), employee: useId() };
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [allLocations, setAllLocations] = useState(false);
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [employeeId, setEmployeeId] = useState(NONE);
  const [active, setActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [prefilled, setPrefilled] = useState(false);
  // Starts closed so a dialog that mounts open (?employee=) still fills its fields.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const preset = employees.data?.find((e) => e.id === presetEmployee);
      setEmail(user?.email ?? '');
      setDisplayName(user?.displayName ?? preset?.fullName ?? '');
      setPassword('');
      setRoleIds(user?.roles.map((r) => r.id) ?? []);
      setAllLocations(user ? user.locationIds.length === 0 : false);
      setLocationIds(user?.locationIds ?? []);
      setEmployeeId(user?.employee?.id ?? presetEmployee ?? NONE);
      setActive(user ? user.status === 'ACTIVE' : true);
      setErrors({});
      setPrefilled(!!user || !presetEmployee || !!preset);
    }
  }
  // The employee list may arrive after the dialog opened from "Create sign-in".
  const late =
    open && !prefilled ? employees.data?.find((e) => e.id === presetEmployee) : undefined;
  if (late) {
    setPrefilled(true);
    setDisplayName((name) => name || late.fullName);
  }

  // An employee can have one sign-in: offer only the unlinked ones (plus this user's own).
  const linked = new Set(
    (users.data ?? []).flatMap((u) => (u.employee && u.id !== user?.id ? [u.employee.id] : [])),
  );
  const employeeOptions = (employees.data ?? []).filter((e) => !linked.has(e.id));

  const submit = () => {
    const base = {
      email,
      displayName,
      roleIds,
      locationIds: allLocations ? [] : locationIds,
      employeeId: employeeId === NONE ? null : employeeId,
      status: active ? ('ACTIVE' as const) : ('INACTIVE' as const),
    };
    const parsed = user
      ? userSchema.safeParse(base)
      : userCreateSchema.safeParse({ ...base, password });
    const errs: Record<string, string> = parsed.success ? {} : toFieldErrors(parsed.error);
    if (!allLocations && locationIds.length === 0)
      errs.locationIds = 'validation.locationsRequired';
    if (!parsed.success || Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setErrors({});
    const onError = (e: unknown) => {
      const fe = isApiError(e) ? e.details?.fieldErrors : undefined;
      if (fe && typeof fe === 'object') setErrors(fe as Record<string, string>);
      toast.error(errorMessage(e));
    };
    const onSuccess = (u: SettingsUser) => {
      toast.success(t(user ? 'users.updated' : 'users.created', { name: u.displayName }));
      onOpenChange(false);
    };
    if (user) save.mutate({ id: user.id, body: parsed.data }, { onSuccess, onError });
    else save.mutate({ body: { ...parsed.data, password } }, { onSuccess, onError });
  };

  const message = (key: string) =>
    errors[key] ? (
      <p className="text-xs text-status-danger-fg" role="alert">
        {t(`common:${errors[key]}`)}
      </p>
    ) : null;

  const field = (id: string, key: string, label: string, control: ReactNode, hint?: string) => (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {control}
      {message(key) ?? (hint && <p className="text-xs text-muted-foreground">{hint}</p>)}
    </div>
  );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !save.isPending && onOpenChange(o)}
      title={user ? t('users.editTitle', { name: user.displayName }) : t('users.newTitle')}
      closeLabel={t('close')}
      size="lg"
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {user && onResetPassword ? (
            <Button variant="outline" onClick={() => onResetPassword(user)}>
              {t('users.resetPassword')}
            </Button>
          ) : (
            <span />
          )}
          <Button size="pos" className="w-full sm:w-auto" loading={save.isPending} onClick={submit}>
            {t('save')}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {field(
          ids.name,
          'displayName',
          t('users.name'),
          <Input
            id={ids.name}
            value={displayName}
            maxLength={60}
            onChange={(e) => setDisplayName(e.target.value)}
          />,
        )}
        {field(
          ids.email,
          'email',
          t('users.email'),
          <Input
            id={ids.email}
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />,
        )}
        {!user &&
          field(
            ids.password,
            'password',
            t('users.password'),
            <Input
              id={ids.password}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />,
            t('users.passwordHint'),
          )}
        {field(
          ids.employee,
          'employeeId',
          t('users.employee'),
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger id={ids.employee} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('users.noEmployee')}</SelectItem>
              {employeeOptions.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.fullName} · {e.jobTitle}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>,
          t('users.employeeHint'),
        )}

        <fieldset className="space-y-2 sm:col-span-2">
          <legend className="text-sm font-medium">{t('users.roles')}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {roles.data?.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm pointer-coarse:min-h-11">
                <Checkbox
                  checked={roleIds.includes(r.id)}
                  onCheckedChange={(v) =>
                    setRoleIds((ids) =>
                      v === true ? [...ids, r.id] : ids.filter((x) => x !== r.id),
                    )
                  }
                />
                {r.name}
              </label>
            ))}
          </div>
          {message('roleIds')}
        </fieldset>

        <fieldset className="space-y-2 sm:col-span-2">
          <legend className="text-sm font-medium">{t('users.locations')}</legend>
          <RadioGroup
            value={allLocations ? 'all' : 'chosen'}
            onValueChange={(v) => setAllLocations(v === 'all')}
            className="gap-2"
          >
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="all" /> {t('users.accessAll')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="chosen" /> {t('users.accessChosen')}
            </label>
          </RadioGroup>
          {!allLocations && (
            <div className="flex flex-wrap gap-x-4 gap-y-2 pl-6">
              {locations.data
                ?.filter((l) => l.isActive || locationIds.includes(l.id))
                .map((l) => (
                  <label
                    key={l.id}
                    className="flex items-center gap-2 text-sm pointer-coarse:min-h-11"
                  >
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
          )}
          {message('locationIds')}
        </fieldset>

        {user && (
          <label className="flex items-start gap-2 text-sm sm:col-span-2 pointer-coarse:min-h-11">
            <Checkbox
              checked={active}
              disabled={user.isYou}
              onCheckedChange={(v) => setActive(v === true)}
            />
            <span>
              <span className="font-medium">{t('users.activeLabel')}</span>
              <span className="block text-muted-foreground">{t('users.activeHint')}</span>
            </span>
          </label>
        )}
      </div>
    </ResponsiveDialog>
  );
}
