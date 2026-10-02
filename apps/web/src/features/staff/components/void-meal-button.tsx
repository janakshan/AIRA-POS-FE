import type { StaffMeal } from '@rbp/types';
import { Button, StatusBadge, toast } from '@rbp/ui';
import { formatMoney } from '@rbp/utils';
import { XCircleIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { useErrorMessage } from '@/components/use-error-message';
import { useSensitiveAction } from '@/features/auth/hooks/use-sensitive-action';
import { useVoidStaffMeal } from '../api/queries';
import { localDay } from '../lib/dates';

/** A-312: only today's meals can be voided, like a POS invoice (POS-012). */
const canVoidMeal = (meal: StaffMeal) =>
  meal.status !== 'VOIDED' && localDay(0, new Date(meal.at)) === localDay();

/** "Voided" badge with who approved it, for a voided meal's row. */
export function VoidedMealBadge({ meal }: { meal: StaffMeal }) {
  const { t } = useTranslation('staff');
  if (meal.status !== 'VOIDED') return null;
  return (
    <StatusBadge
      tone="danger"
      size="sm"
      title={
        meal.voided
          ? t('voidMeal.voidedBy', {
              name: meal.voided.approvedBy,
              reason: meal.voided.reason.label,
            })
          : undefined
      }
    >
      {t('voidMeal.badge')}
    </StatusBadge>
  );
}

/**
 * A-312 void a staff meal: manager PIN (`staff.manage`) + reason. Every stock movement the meal
 * made comes back and it stops counting against the allowance; the meal stays listed as Voided.
 */
export function VoidMealButton({ meal }: { meal: StaffMeal }) {
  const { t, i18n } = useTranslation('staff');
  const locale = localeFor(i18n.language);
  const errorMessage = useErrorMessage();
  const confirmSensitive = useSensitiveAction();
  const voidMeal = useVoidStaffMeal();
  if (meal.status === 'VOIDED') return null;
  const today = canVoidMeal(meal);

  const run = async () => {
    const verification = await confirmSensitive('staff.meal.void', {
      reasonTitle: t('voidMeal.reasonTitle', { number: meal.number }),
      reasonDescription: t('voidMeal.reasonDescription'),
      summary: `${meal.number} · ${meal.employeeName} · ${formatMoney(meal.value, locale)}`,
    });
    if (!verification) return;
    voidMeal.mutate(
      { id: meal.id, body: { verification } },
      {
        onSuccess: (v) =>
          toast.success(
            t('voidMeal.done', { number: v.number, value: formatMoney(v.value, locale) }),
          ),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="pointer-coarse:min-h-11"
      disabled={!today || voidMeal.isPending}
      loading={voidMeal.isPending}
      title={today ? undefined : t('voidMeal.onlyToday')}
      aria-label={t('voidMeal.actionFor', { number: meal.number })}
      onClick={(e) => {
        e.stopPropagation();
        void run();
      }}
    >
      <XCircleIcon /> {t('voidMeal.action')}
    </Button>
  );
}
