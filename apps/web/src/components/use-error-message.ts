import { isApiError } from '@rbp/api-client';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/** Map an error to a localised, user-facing message using stable error codes. */
export function useErrorMessage() {
  const { t } = useTranslation();
  return useCallback(
    (error: unknown): string => {
      if (isApiError(error)) {
        const message = t(`errors.${error.code}`, { defaultValue: error.message });
        // A business rule's own wording (e.g. LAST_ADMIN) when there is one.
        const reason = error.details?.reason;
        return typeof reason === 'string'
          ? t(`errorReasons.${reason}`, { defaultValue: message, ...error.details })
          : message;
      }
      return t('errors.INTERNAL_ERROR');
    },
    [t],
  );
}
