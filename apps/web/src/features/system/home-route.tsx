import { Navigate } from 'react-router';
import { AccessDenied } from '@/components/access-denied';
import { DashboardPage } from '@/features/dashboard/pages/dashboard-page';
import { useAccess } from '@/features/auth/hooks/use-access';
import { DASHBOARD_ITEM } from '@/navigation/nav-config';

/** Land each role on its natural home: dashboard, else kitchen board, else POS. */
export function HomeRoute() {
  const { check } = useAccess();
  const dashboard = check(DASHBOARD_ITEM);
  if (dashboard.allowed) return <DashboardPage />;
  if (check({ feature: 'KOT', permission: 'kot.view' }).allowed)
    return <Navigate to="/kitchen" replace />;
  if (check({ feature: 'POS_RETAIL', permission: 'pos.sale.create' }).allowed)
    return <Navigate to="/pos" replace />;
  return <AccessDenied result={dashboard} />;
}
