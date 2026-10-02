import type { SettingsUser } from '@rbp/types';
import { Button, Input, ResponsiveDialog, toast } from '@rbp/ui';
import { passwordResetSchema, toFieldErrors } from '@rbp/validation';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '@/components/use-error-message';
import { useResetPassword } from '../api/queries';

/** SET-003 set a new temporary password (never shown again or recorded). */
export function PasswordDialog({
  user,
  onOpenChange,
}: {
  user: SettingsUser | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('settings');
  const errorMessage = useErrorMessage();
  const reset = useResetPassword();
  const id = useId();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shownFor, setShownFor] = useState<string | null>(null);
  if ((user?.id ?? null) !== shownFor) {
    setShownFor(user?.id ?? null);
    setPassword('');
    setError(null);
  }

  const submit = () => {
    if (!user) return;
    const parsed = passwordResetSchema.safeParse({ password });
    if (!parsed.success) {
      setError(toFieldErrors(parsed.error).password ?? 'validation.passwordMin8');
      return;
    }
    reset.mutate(
      { id: user.id, password },
      {
        onSuccess: () => {
          toast.success(t('users.passwordReset', { name: user.displayName }));
          onOpenChange(false);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  return (
    <ResponsiveDialog
      open={!!user}
      onOpenChange={(o) => !reset.isPending && onOpenChange(o)}
      title={t('users.resetTitle', { name: user?.displayName ?? '' })}
      closeLabel={t('close')}
      footer={
        <Button size="pos" className="w-full sm:w-auto" loading={reset.isPending} onClick={submit}>
          {t('users.resetPassword')}
        </Button>
      }
    >
      <div className="space-y-1.5">
        <label htmlFor={id} className="text-sm font-medium">
          {t('users.newPassword')}
        </label>
        <Input
          id={id}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? (
          <p className="text-xs text-status-danger-fg" role="alert">
            {t(`common:${error}`)}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{t('users.passwordHint')}</p>
        )}
      </div>
    </ResponsiveDialog>
  );
}
