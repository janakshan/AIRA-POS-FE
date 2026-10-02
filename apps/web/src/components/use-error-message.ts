import { isApiError } from '@rbp/api-client';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/** Map an error to a localised, user-facing message using stable error codes. */
export function useErrorMessage() {
  const { t } = useTranslation();
  return useCallback(
    (error: unknown): string => {
      if (isApiError(error)) return t(`errors.${error.code}`, { defaultValue: error.message });
      return t('errors.INTERNAL_ERROR');
    },
    [t],
  );
}
