import type { RouteObject } from 'react-router';

/** REP-006 audit log (lazy). The nav item's report.audit.view guard wraps it. */
export const auditRoutes: Record<string, RouteObject[]> = {
  auditReport: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/audit-log-page')).AuditLogPage,
      }),
    },
  ],
};
