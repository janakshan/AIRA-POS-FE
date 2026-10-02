import { isApiError } from '@rbp/api-client';
import { FullPageLoader } from '@rbp/ui';
import { type ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router';
import { AccessDenied } from '@/components/access-denied';
import { QueryError } from '@/components/query-error';
import type { AccessRequirement } from '@/navigation/nav-config';
import { useSessionStore } from '@/stores/session-store';
import { useMe } from '../api/queries';
import { useAccess } from '../hooks/use-access';

/** Requires a signed-in user with a resolved /me context. */
export function RequireAuth() {
  const { t } = useTranslation();
  const token = useSessionStore((s) => s.accessToken);
  const setLocation = useSessionStore((s) => s.setLocation);
  const location = useLocation();
  const me = useMe();

  const locationRejected = isApiError(me.error) && me.error.code === 'LOCATION_NOT_ALLOWED';
  useEffect(() => {
    if (locationRejected) setLocation(null);
  }, [locationRejected, setLocation]);

  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (me.data) return <Outlet />;
  if (me.isError && !locationRejected) {
    return <QueryError error={me.error} onRetry={() => void me.refetch()} className="min-h-dvh" />;
  }
  return <FullPageLoader label={t('states.loading')} />;
}

/** Requires an operating location to be selected (AUTH-003). */
export function RequireLocation() {
  const { t } = useTranslation();
  const { data: me, isPlaceholderData } = useMe();
  const location = useLocation();
  // Right after a location is chosen, /me for that location is still loading (or showing the
  // previous response). Only redirect once a fresh response confirms there is no location.
  if (!me || (!me.currentLocation && isPlaceholderData)) {
    return <FullPageLoader label={t('states.loading')} />;
  }
  if (!me.currentLocation) {
    return <Navigate to="/select-location" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/** Feature + permission gate. Shows a 403 state rather than hiding (SCN-006). */
export function RequireAccess({ children, ...req }: AccessRequirement & { children: ReactNode }) {
  const { check } = useAccess();
  const result = check(req);
  if (!result.allowed) return <AccessDenied result={result} />;
  return <>{children}</>;
}
