import { isApiError } from '@rbp/api-client';
import {
  PERMISSION_FEATURE,
  PERMISSION_GROUPS,
  type Permission,
  type SettingsRole,
} from '@rbp/types';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
  StatusBadge,
  toast,
} from '@rbp/ui';
import { roleSchema, toFieldErrors } from '@rbp/validation';
import { ShieldIcon, Trash2Icon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useUnsavedChangesGuard } from '@/components/unsaved-changes-guard';
import { useErrorMessage } from '@/components/use-error-message';
import { useAccess } from '@/features/auth/hooks/use-access';
import { useBreadcrumbTitle } from '@/navigation/breadcrumb-store';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useDeleteRole, useSaveRole, useSettingsRoles } from '../api/queries';

/** SET-004 role editor: name and a grouped permission grid. The Owner role opens read-only. */
export function RoleFormPage() {
  const { t } = useTranslation('settings');
  const { id } = useParams();
  const [params] = useSearchParams();
  const roles = useSettingsRoles();
  const role = id ? roles.data?.find((r) => r.id === id) : undefined;
  const source = role ?? roles.data?.find((r) => r.id === params.get('copy'));
  const title = role
    ? t(role.locked ? 'roles.viewTitle' : 'roles.editTitle', { name: role.name })
    : t('roles.newTitle');
  useBreadcrumbTitle(role?.name ?? t('roles.newTitle'));

  return (
    <Screen id="SET-004" title={title} className="mx-auto max-w-4xl space-y-section">
      <PageHeader eyebrow={<PageBreadcrumbs />} title={title} />
      {roles.isError ? (
        <Card>
          <QueryError error={roles.error} onRetry={() => void roles.refetch()} />
        </Card>
      ) : !roles.data ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : id && !role ? (
        <Card>
          <EmptyState
            icon={ShieldIcon}
            title={t('roles.notFound')}
            action={
              <Button asChild variant="outline">
                <Link to="/settings/roles">{t('roles.back')}</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <RoleForm
          // Remount per role so the form starts from it.
          key={role?.id ?? `new-${source?.id ?? ''}`}
          role={role}
          initial={
            role
              ? { name: role.name, permissions: role.permissions }
              : source
                ? {
                    name: t('roles.copyOf', { name: source.name }),
                    permissions: source.permissions,
                  }
                : { name: '', permissions: [] }
          }
        />
      )}
    </Screen>
  );
}

function RoleForm({
  role,
  initial,
}: {
  role: SettingsRole | undefined;
  initial: { name: string; permissions: Permission[] };
}) {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const { hasFeature } = useAccess();
  const errorMessage = useErrorMessage();
  const save = useSaveRole();
  const remove = useDeleteRole();
  const nameId = useId();
  const [name, setName] = useState(initial.name);
  const [permissions, setPermissions] = useState<Set<Permission>>(new Set(initial.permissions));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const readOnly = !!role?.locked;
  const dirty =
    name !== initial.name ||
    permissions.size !== initial.permissions.length ||
    initial.permissions.some((p) => !permissions.has(p));
  const guard = useUnsavedChangesGuard(dirty && !save.isPending && !readOnly);

  const toggle = (list: Permission[], on: boolean) =>
    setPermissions((current) => {
      const next = new Set(current);
      for (const p of list) {
        if (on) next.add(p);
        else next.delete(p);
      }
      return next;
    });

  const submit = () => {
    const parsed = roleSchema.safeParse({ name, permissions: [...permissions] });
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    save.mutate(
      { ...(role ? { id: role.id } : {}), body: parsed.data },
      {
        onSuccess: (saved) => {
          toast.success(t(role ? 'roles.updated' : 'roles.created', { name: saved.name }));
          guard.bypass();
          void navigate('/settings/roles');
        },
        onError: (e) => {
          const fe = isApiError(e) ? e.details?.fieldErrors : undefined;
          if (fe && typeof fe === 'object') setErrors(fe as Record<string, string>);
          toast.error(errorMessage(e));
        },
      },
    );
  };

  const confirmDelete = () => {
    if (!role) return;
    remove.mutate(role.id, {
      onSuccess: () => {
        toast.success(t('roles.deleted', { name: role.name }));
        guard.bypass();
        void navigate('/settings/roles');
      },
      onError: (e) => {
        setConfirming(false);
        toast.error(errorMessage(e));
      },
    });
  };

  return (
    <>
      {readOnly ? (
        <Alert tone="info" title={t('roles.lockedHint')} />
      ) : (
        <Alert tone="info" title={t('roles.effect')} />
      )}
      <Card>
        <CardContent className="space-y-1.5">
          <label htmlFor={nameId} className="text-sm font-medium">
            {t('roles.name')}
          </label>
          <Input
            id={nameId}
            value={name}
            maxLength={40}
            disabled={readOnly}
            onChange={(e) => setName(e.target.value)}
          />
          {errors.name && (
            <p className="text-xs text-status-danger-fg" role="alert">
              {t(`common:${errors.name}`)}
            </p>
          )}
        </CardContent>
      </Card>
      {errors.permissions && <Alert tone="danger" title={t(`common:${errors.permissions}`)} />}
      <div className="grid gap-4 md:grid-cols-2">
        {PERMISSION_GROUPS.map((group) => {
          const held = group.permissions.filter((p) => permissions.has(p)).length;
          const all = held === group.permissions.length;
          const groupLabel = t(`groups.${group.key}`);
          return (
            <Card key={group.key} role="group" aria-label={groupLabel}>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">{groupLabel}</CardTitle>
                {!readOnly && group.permissions.length > 1 && (
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Checkbox
                      checked={all ? true : held ? 'indeterminate' : false}
                      onCheckedChange={(v) => toggle(group.permissions, v === true)}
                      aria-label={`${t('roles.selectAll')}: ${groupLabel}`}
                    />
                    {t('roles.selectAll')}
                  </label>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {group.permissions.map((p) => {
                  const feature = PERMISSION_FEATURE[p];
                  const off = !!feature && !hasFeature(feature);
                  return (
                    <label
                      key={p}
                      className="flex items-start gap-3 text-sm pointer-coarse:min-h-11"
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={permissions.has(p)}
                        disabled={readOnly}
                        onCheckedChange={(v) => toggle([p], v === true)}
                      />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2 font-medium">
                          {t(`permissions.${p}.label`)}
                          {off && (
                            <StatusBadge tone="neutral" size="sm" title={t('roles.moduleOffHint')}>
                              {t('roles.moduleOff')}
                            </StatusBadge>
                          )}
                        </span>
                        <span className="block text-muted-foreground">
                          {t(`permissions.${p}.hint`)}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {!readOnly && (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {role ? (
            <Button variant="outline" onClick={() => setConfirming(true)}>
              <Trash2Icon /> {t('roles.delete')}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/settings/roles">{t('cancel')}</Link>
            </Button>
            <Button size="pos" loading={save.isPending} onClick={submit}>
              {t('save')}
            </Button>
          </div>
        </div>
      )}
      {role && (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={t('roles.deleteTitle', { name: role.name })}
          description={t('roles.deleteBody')}
          confirmLabel={t('roles.delete')}
          cancelLabel={t('cancel')}
          destructive
          loading={remove.isPending}
          onConfirm={confirmDelete}
        />
      )}
      {guard.dialog}
    </>
  );
}
