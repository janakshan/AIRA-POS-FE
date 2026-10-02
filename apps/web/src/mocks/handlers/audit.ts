import { http, HttpResponse } from 'msw';
import { requirePermission, resolveContext } from '../context';
import { db } from '../db';
import { API, handle, paginate } from '../http';

export const auditHandlers = [
  /** POS-007: tenant reasons, optionally only those offered for one sensitive action. */
  http.get(
    `${API}/reasons`,
    handle(({ request }) => {
      const ctx = resolveContext(request);
      const action = new URL(request.url).searchParams.get('action');
      const reasons = db.get().reasons[ctx.me.tenant.id] ?? [];
      return HttpResponse.json(
        action
          ? reasons.filter((r) => !r.appliesTo?.length || r.appliesTo.includes(action))
          : reasons,
      );
    }),
  ),

  /** REP-006 audit trail, newest first. Read-only: events are never edited or removed. */
  http.get(
    `${API}/audit-events`,
    handle(({ request }) => {
      const ctx = resolveContext(request);
      requirePermission(ctx, 'report.audit.view');
      const p = new URL(request.url).searchParams;
      const entity = p.get('entity');
      const entityId = p.get('entityId');
      const action = p.get('action');
      const actionPrefix = p.get('actionPrefix');
      const employeeId = p.get('employeeId');
      const userId = p.get('userId');
      const from = p.get('from');
      const to = p.get('to');
      const sensitive = p.get('sensitive') === 'true';
      const locationId = p.get('locationId');
      const q = p.get('search')?.trim().toLowerCase();
      const items = db
        .get()
        .auditLog.filter(
          (e) =>
            e.tenantId === ctx.me.tenant.id &&
            (!entity || e.entity === entity) &&
            (!entityId || e.entityId === entityId) &&
            (!action || e.action === action) &&
            (!actionPrefix || e.action.startsWith(actionPrefix)) &&
            (!employeeId || e.employee?.id === employeeId) &&
            (!userId || e.userId === userId) &&
            (!from || e.at >= from) &&
            (!to || e.at <= to) &&
            (!sensitive || !!e.employee) &&
            (!locationId || e.locationId === locationId) &&
            (!q ||
              [
                e.entityLabel,
                e.action,
                e.userName,
                e.employee?.fullName,
                e.reason?.label,
                e.reason?.comment,
              ]
                .filter(Boolean)
                .some((s) => String(s).toLowerCase().includes(q))),
        );
      return HttpResponse.json(paginate(items, new URL(request.url)));
    }),
  ),

  /** Employees at the user's locations (audit filters, operator pickers). No PINs, ever. */
  http.get(
    `${API}/employees`,
    handle(({ request }) => {
      const ctx = resolveContext(request);
      const locationId = new URL(request.url).searchParams.get('locationId');
      const allowed = new Set(ctx.me.locations.map((l) => l.id as string));
      return HttpResponse.json(
        db
          .get()
          .employees.filter(
            (e) =>
              e.tenantId === ctx.me.tenant.id &&
              e.locationIds.some((l) => allowed.has(l)) &&
              (!locationId || e.locationIds.includes(locationId as never)),
          )
          .map(({ id, code, fullName, jobTitle }) => ({ id, code, fullName, jobTitle })),
      );
    }),
  ),
];
