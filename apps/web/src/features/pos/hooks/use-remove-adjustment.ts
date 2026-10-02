import type { SaleAdjustment } from '@rbp/types';
import { toast } from '@rbp/ui';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '@/components/use-error-message';
import { useSensitiveAction } from '@/features/auth/hooks/use-sensitive-action';
import { useVoidAdjustment } from '../api/queries';
import type { CartView } from './use-cart';

/**
 * Remove a discount/charge from the sale. The server voids (never deletes) and audits it:
 * a discount comes off freely (the price goes up); a charge needs a manager PIN + reason.
 */
export function useRemoveAdjustment(cart: CartView) {
  const { t } = useTranslation('pos');
  const errorMessage = useErrorMessage();
  const confirmSensitive = useSensitiveAction();
  const voidAdjustment = useVoidAdjustment();

  const remove = async (adjustment: SaleAdjustment) => {
    // Only removals that lower what the customer pays need approval (mirrors the API).
    const lowersPrice =
      adjustment.kind === 'CHARGE' ||
      (adjustment.kind === 'PRICE' && (adjustment.previousValue ?? 0) < adjustment.value);
    let verification;
    if (lowersPrice) {
      const isPrice = adjustment.kind === 'PRICE';
      verification = await confirmSensitive(isPrice ? 'pos.price.override' : 'pos.charge.manage', {
        reasonTitle: t(isPrice ? 'price.reasonTitle' : 'charge.reasonTitle'),
        reasonDescription: t(isPrice ? 'price.reasonDescription' : 'charge.reasonDescription'),
        summary: t('adjustment.removeSummary', { label: adjustment.label }),
      });
      if (!verification) return false;
    }
    try {
      await voidAdjustment.mutateAsync({
        id: adjustment.id,
        body: verification ? { verification } : {},
      });
      cart.removeAdjustment(adjustment.id);
      toast.success(
        t(
          adjustment.kind === 'CHARGE'
            ? 'charge.removed'
            : adjustment.kind === 'PRICE'
              ? 'price.removed'
              : 'discount.removed',
          { label: adjustment.label },
        ),
      );
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    }
  };

  return { remove, pending: voidAdjustment.isPending };
}
