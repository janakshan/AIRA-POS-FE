import { isApiError } from '@rbp/api-client';
import { SENSITIVE_ACTIONS } from '@rbp/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  PinKeypad,
  toast,
} from '@rbp/ui';
import { PIN_LENGTH } from '@rbp/validation';
import { Loader2Icon, ShieldCheckIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '@/components/use-error-message';
import { useSessionStore } from '@/stores/session-store';
import { useVerifyEmployee } from '../api/queries';
import { useAccess } from '../hooks/use-access';
import { sensitiveActionLabel } from '../lib/sensitive-action-label';
import { usePinPromptStore } from '../store/pin-prompt-store';

/** AUTH-004 / POS-006 Employee PIN verification. Mounted once; driven by useEmployeeVerification(). */
export function EmployeePinDialog() {
  const { t } = useTranslation('auth');
  const prompt = usePinPromptStore((s) => s.prompt);
  const close = usePinPromptStore((s) => s.close);
  const setLastVerification = useSessionStore((s) => s.setLastVerification);
  const verify = useVerifyEmployee();
  const errorMessage = useErrorMessage();
  const { can } = useAccess();
  const [pin, setPin] = useState('');

  const finish = (result: Parameters<NonNullable<typeof prompt>['resolve']>[0]) => {
    prompt?.resolve(result);
    close();
    setPin('');
    verify.reset();
  };

  const submit = (value: string) => {
    if (!prompt) return;
    verify.mutate(
      { pin: value, action: prompt.action },
      {
        onSuccess: (result) => {
          setLastVerification(result);
          toast.success(t('pin.verified', { name: result.employee.fullName }));
          finish(result);
        },
        onError: () => setPin(''),
      },
    );
  };

  const remaining =
    isApiError(verify.error) && typeof verify.error.details?.attemptsRemaining === 'number'
      ? verify.error.details.attemptsRemaining
      : undefined;
  const actionLabel = prompt ? sensitiveActionLabel(t, prompt.action) : '';
  // Correct PIN, but that person can't approve this action: say so and hand over.
  const notAuthorized =
    isApiError(verify.error) && verify.error.code === 'EMPLOYEE_NOT_AUTHORIZED'
      ? t('pin.notAuthorized', {
          name: String(verify.error.details?.employee ?? ''),
          action: actionLabel.toLowerCase(),
        })
      : null;
  const operatorCan = prompt ? can(SENSITIVE_ACTIONS[prompt.action].permission) : true;

  return (
    <Dialog open={!!prompt} onOpenChange={(open) => !open && finish(null)}>
      <DialogContent className="max-w-sm" closeLabel={t('common:actions.close')}>
        <DialogHeader className="items-center text-center sm:text-center">
          <span className="mb-1 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheckIcon className="size-6" />
          </span>
          <DialogTitle>{t('pin.title')}</DialogTitle>
          <DialogDescription>{t('pin.subtitle')}</DialogDescription>
          {prompt && (
            <div className="mt-1 w-full space-y-1 rounded-lg bg-muted px-3 py-2 text-sm">
              <p className="font-semibold">{actionLabel}</p>
              {prompt.summary && <p className="text-muted-foreground">{prompt.summary}</p>}
              {!operatorCan && (
                <p className="text-xs font-medium text-status-warning-fg">
                  {t('pin.managerNeeded')}
                </p>
              )}
            </div>
          )}
        </DialogHeader>
        <PinKeypad
          value={pin}
          onChange={(v) => {
            if (verify.isError) verify.reset();
            setPin(v);
          }}
          onComplete={submit}
          length={PIN_LENGTH}
          disabled={verify.isPending}
          error={verify.isError}
          clearLabel={t('common:actions.clear')}
          backspaceLabel={t('common:actions.backspace')}
        />
        <div className="min-h-5 text-center text-sm" aria-live="assertive">
          {verify.isPending && (
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" /> {t('pin.verifying')}
            </span>
          )}
          {verify.isError && (
            <span className="text-destructive">
              {notAuthorized ?? errorMessage(verify.error)}
              {remaining !== undefined && ` ${t('pin.attemptsLeft', { count: remaining })}`}
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
