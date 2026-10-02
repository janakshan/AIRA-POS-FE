import { isApiError } from '@rbp/api-client';
import { ErrorState } from '@rbp/ui';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from './use-error-message';

export function QueryError({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const message = useErrorMessage();
  const code = isApiError(error)
    ? [error.code, error.requestId].filter(Boolean).join(' · ')
    : undefined;
  return (
    <ErrorState
      className={className}
      title={t('states.errorTitle')}
      description={message(error)}
      code={code}
      onRetry={onRetry}
      retryLabel={t('actions.retry')}
    />
  );
}
