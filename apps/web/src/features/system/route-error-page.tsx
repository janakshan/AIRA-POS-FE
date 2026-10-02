import { ErrorState } from '@rbp/ui';
import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, useRouteError } from 'react-router';

export function RouteErrorPage() {
  const { t } = useTranslation();
  const error = useRouteError();
  console.error(error);
  const code = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : undefined;
  return (
    <ErrorState
      className="min-h-dvh"
      title={t('states.errorTitle')}
      description={t('errors.INTERNAL_ERROR')}
      code={code}
      onRetry={() => window.location.reload()}
      retryLabel={t('actions.retry')}
    />
  );
}
