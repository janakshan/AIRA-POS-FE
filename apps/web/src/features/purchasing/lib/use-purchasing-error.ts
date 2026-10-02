import { isApiError } from '@rbp/api-client';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '@/components/use-error-message';

/**
 * Error toasts for PUR-003: a 409 for an inactive supplier isn't "changed by someone else",
 * so it gets its own message; everything else falls back to the shared mapping.
 */
export function usePurchasingErrorMessage() {
  const { t } = useTranslation('purchasing');
  const errorMessage = useErrorMessage();
  return useCallback(
    (error: unknown) =>
      isApiError(error) && error.details?.reason === 'SUPPLIER_INACTIVE'
        ? t('orderForm.supplierInactiveError')
        : errorMessage(error),
    [t, errorMessage],
  );
}
