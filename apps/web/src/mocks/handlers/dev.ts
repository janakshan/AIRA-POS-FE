import type { DevDemoAccount, DevImpersonation, DevMember, TenantSummary } from '@rbp/types';
import { http, HttpResponse } from 'msw';
import { allowedLocations, issueToken } from '../context';
import { db } from '../db';
import { DEMO_PASSWORD } from '../db/seed';
import { API, handle, MockHttpError } from '../http';

function memberView(tenantUserId: string): DevMember {
  const state = db.get();
  const tu = state.tenantUsers.find((t) => t.id === tenantUserId)!;
  const user = state.users.find((u) => u.id === tu.userId)!;
  const role = state.roles.find((r) => tu.roleIds.includes(r.id))!;
  return {
    tenantUserId: tu.id,
    displayName: user.displayName,
    email: user.email,
    roleName: role.name,
    roleCode: role.code,
  };
}

/** Dev/support-only endpoints (AUTH-002 tenant switcher, role impersonation). Mock API only. */
export const devHandlers = [
  http.get(
    `${API}/dev/tenants`,
    handle(
      () =>
        HttpResponse.json<TenantSummary[]>(
          db.get().tenants.map(({ id, code, name, status }) => ({ id, code, name, status })),
        ),
      { devOnly: true },
    ),
  ),

  http.get(
    `${API}/dev/tenants/:tenantId/members`,
    handle(
      ({ params }) =>
        HttpResponse.json<DevMember[]>(
          db
            .get()
            .tenantUsers.filter((t) => t.tenantId === params.tenantId)
            .map((t) => memberView(t.id)),
        ),
      { devOnly: true },
    ),
  ),

  http.get(
    `${API}/dev/tenants/:tenantId/devices`,
    handle(
      ({ params }) =>
        HttpResponse.json(db.get().devices.filter((d) => d.tenantId === params.tenantId)),
      {
        devOnly: true,
      },
    ),
  ),

  http.get(
    `${API}/dev/demo-accounts`,
    handle(
      () => {
        const state = db.get();
        return HttpResponse.json<DevDemoAccount[]>(
          state.tenantUsers.map((tu) => {
            const m = memberView(tu.id);
            return {
              email: m.email,
              displayName: m.displayName,
              roleName: m.roleName,
              tenantName: state.tenants.find((t) => t.id === tu.tenantId)!.name,
              password: DEMO_PASSWORD,
            };
          }),
        );
      },
      { devOnly: true },
    ),
  ),

  http.post(
    `${API}/dev/impersonate`,
    handle(
      async ({ request }) => {
        const { tenantUserId } = (await request.json()) as { tenantUserId: string };
        const tu = db.get().tenantUsers.find((t) => t.id === tenantUserId);
        if (!tu) throw new MockHttpError('NOT_FOUND', 404, 'Tenant user not found');
        return HttpResponse.json<DevImpersonation>({
          accessToken: issueToken(tu.id),
          member: memberView(tu.id),
          locationIds: allowedLocations(tu.tenantId, tu.locationIds).map((l) => l.id),
        });
      },
      { devOnly: true },
    ),
  ),

  http.post(
    `${API}/dev/reset`,
    handle(
      () => {
        db.reset();
        return new HttpResponse(null, { status: 204 });
      },
      { devOnly: true },
    ),
  ),
];
