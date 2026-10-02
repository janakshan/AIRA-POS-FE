import type {
  ChargeCode,
  ChargeSetting,
  ChargeSettings,
  ChargeType,
  LimitCode,
  Location,
  PosSettings,
  Role,
  SettingsLocation,
  SettingsRole,
  SettingsUser,
  TenantUser,
  User,
  UserStatus,
} from '@rbp/types';
import { newId } from '@rbp/utils';
import {
  chargeSettingsSchema,
  locationSchema,
  passwordResetSchema,
  roleSchema,
  userCreateSchema,
  userSchema,
} from '@rbp/validation';
import { http, HttpResponse } from 'msw';
import { recordAudit } from '../audit';
import { type MockContext, requirePermission, resolveContext } from '../context';
import { db } from '../db';
import type { MockDb } from '../db/seed';
import { API, handle, MockHttpError, parseBody } from '../http';

/**
 * SET-002/003/004/007. `settings.manage` is a tenant-wide admin permission: these screens see
 * every location of the tenant, including inactive ones. No PIN — every write is audited.
 */

export function admin(request: Request): MockContext {
  const ctx = resolveContext(request);
  requirePermission(ctx, 'settings.manage');
  return ctx;
}

export const conflict = (message: string, reason: string, details: Record<string, unknown> = {}) =>
  new MockHttpError('CONFLICT', 409, message, { reason, ...details });

export const fieldConflict = (message: string, fieldErrors: Record<string, string>) =>
  new MockHttpError('CONFLICT', 409, message, { fieldErrors });

export function tenantLocation(ctx: MockContext, id: string): Location {
  const location = db.get().locations.find((l) => l.id === id && l.tenantId === ctx.me.tenant.id);
  if (!location) throw new MockHttpError('NOT_FOUND', 404, 'Location not found');
  return location;
}

export function checkLimit(ctx: MockContext, limit: LimitCode, inUse: number) {
  const max = db.get().limits[ctx.me.tenant.id]?.[limit];
  if (max !== undefined && inUse >= max) {
    throw conflict(`Your plan allows ${max} ${limit}`, 'LIMIT_REACHED', { limit, max });
  }
}

/** Active logins that would still hold settings.manage — never allowed to reach zero. */
function requireAnAdmin(tenantId: string, tenantUsers: TenantUser[], roles: Role[]) {
  const adminRoles = new Set(
    roles
      .filter((r) => r.tenantId === tenantId && r.permissions.includes('settings.manage'))
      .map((r) => r.id as string),
  );
  const admins = tenantUsers.filter(
    (t) =>
      t.tenantId === tenantId &&
      t.status === 'ACTIVE' &&
      t.roleIds.some((id) => adminRoles.has(id)),
  );
  if (admins.length === 0) {
    throw conflict('At least one active login must keep settings access', 'LAST_ADMIN');
  }
}

// ── SET-007 Charges ───────────────────────────────────────────────────────────

const CHARGE_CODES: ChargeCode[] = ['SERVICE', 'DELIVERY', 'PACKAGING', 'OTHER'];

/** What a code looks like before a location offers it. */
const CHARGE_TEMPLATES: Record<ChargeCode, ChargeType> = {
  SERVICE: {
    code: 'SERVICE',
    name: 'Service charge',
    mode: 'PERCENT',
    defaultValue: 1000,
    automatic: true,
  },
  DELIVERY: {
    code: 'DELIVERY',
    name: 'Delivery',
    mode: 'FIXED',
    defaultValue: 25000,
    automatic: false,
  },
  PACKAGING: {
    code: 'PACKAGING',
    name: 'Packaging',
    mode: 'FIXED',
    defaultValue: 5000,
    automatic: false,
  },
  OTHER: {
    code: 'OTHER',
    name: 'Other charge',
    mode: 'FIXED',
    defaultValue: null,
    automatic: false,
  },
};

function chargeSettings(locationId: string): ChargeSettings {
  const offered = db.get().chargeTypes[locationId] ?? [];
  return {
    locationId: locationId as Location['id'],
    charges: CHARGE_CODES.map((code): ChargeSetting => {
      const own = offered.find((c) => c.code === code);
      return { ...(own ?? CHARGE_TEMPLATES[code]), offered: !!own };
    }),
  };
}

const DEFAULT_POS: Omit<PosSettings, 'locationId'> = {
  serviceChargeBps: 0,
  taxRateBps: 0,
  taxLabel: 'Tax',
  maxDiscountBps: 5000,
  returnWindowDays: 30,
  receiptFooter: 'Thank you!',
  receiptPrinter: 'Receipt Printer',
};

/** The location's POS settings row, created on first write. */
export function posRow(d: MockDb, locationId: string): PosSettings {
  let row = d.posSettings.find((s) => s.locationId === locationId);
  if (!row) {
    row = { locationId: locationId as Location['id'], ...DEFAULT_POS };
    d.posSettings.push(row);
  }
  return row;
}

// ── SET-002 Locations ─────────────────────────────────────────────────────────

function locationView(location: Location): SettingsLocation {
  const state = db.get();
  const {
    locationId: _,
    serviceChargeBps,
    ...pos
  } = state.posSettings.find((s) => s.locationId === location.id) ?? {
    locationId: location.id,
    ...DEFAULT_POS,
  };
  return {
    ...location,
    pos,
    serviceChargeBps,
    userCount: state.tenantUsers.filter(
      (t) =>
        t.tenantId === location.tenantId &&
        t.status === 'ACTIVE' &&
        (t.locationIds.length === 0 || t.locationIds.includes(location.id)),
    ).length,
  };
}

function requireUniqueLocationCode(ctx: MockContext, code: string, exceptId?: string) {
  const taken = db
    .get()
    .locations.some(
      (l) =>
        l.tenantId === ctx.me.tenant.id &&
        l.id !== exceptId &&
        l.code.toLowerCase() === code.toLowerCase(),
    );
  if (taken) throw fieldConflict('Location code already used', { code: 'validation.codeTaken' });
}

export const activeLocations = (ctx: MockContext) =>
  db.get().locations.filter((l) => l.tenantId === ctx.me.tenant.id && l.isActive);

// ── SET-003 Users ─────────────────────────────────────────────────────────────

function userView(ctx: MockContext, tu: TenantUser): SettingsUser {
  const state = db.get();
  const user = state.users.find((u) => u.id === tu.userId)!;
  const employee = tu.employeeId ? state.employees.find((e) => e.id === tu.employeeId) : undefined;
  return {
    id: tu.id,
    userId: tu.userId,
    email: user.email,
    displayName: user.displayName,
    status: tu.status,
    roles: state.roles
      .filter((r) => tu.roleIds.includes(r.id))
      .map((r) => ({ id: r.id, name: r.name })),
    locationIds: tu.locationIds,
    employee: employee ? { id: employee.id, fullName: employee.fullName } : null,
    isYou: tu.id === ctx.me.tenantUser.id,
  };
}

/** Roles, locations and the employee link must all belong to this tenant. */
function checkUserRefs(
  ctx: MockContext,
  body: { roleIds: string[]; locationIds: string[]; employeeId?: string | null },
  exceptTenantUserId?: string,
) {
  const state = db.get();
  const tenantId = ctx.me.tenant.id;
  if (body.roleIds.some((id) => !state.roles.some((r) => r.id === id && r.tenantId === tenantId))) {
    throw new MockHttpError('VALIDATION_FAILED', 400, 'Unknown role', {
      fieldErrors: { roleIds: 'validation.rolesRequired' },
    });
  }
  if (
    body.locationIds.some(
      (id) => !state.locations.some((l) => l.id === id && l.tenantId === tenantId),
    )
  ) {
    throw new MockHttpError('VALIDATION_FAILED', 400, 'Unknown location', {
      fieldErrors: { locationIds: 'validation.locationRequired' },
    });
  }
  if (body.employeeId) {
    if (!state.employees.some((e) => e.id === body.employeeId && e.tenantId === tenantId)) {
      throw new MockHttpError('NOT_FOUND', 404, 'Employee not found');
    }
    const linked = state.tenantUsers.find(
      (t) => t.employeeId === body.employeeId && t.id !== exceptTenantUserId,
    );
    if (linked) {
      throw fieldConflict('That employee already has a sign-in', {
        employeeId: 'validation.employeeHasLogin',
      });
    }
  }
}

function requireUniqueEmail(email: string, exceptUserId?: string) {
  if (db.get().users.some((u) => u.id !== exceptUserId && u.email.toLowerCase() === email)) {
    throw fieldConflict('Email already used', { email: 'validation.emailTaken' });
  }
}

export const activeUsers = (ctx: MockContext) =>
  db.get().tenantUsers.filter((t) => t.tenantId === ctx.me.tenant.id && t.status === 'ACTIVE');

function tenantUserOr404(ctx: MockContext, id: string): TenantUser {
  const tu = db.get().tenantUsers.find((t) => t.id === id && t.tenantId === ctx.me.tenant.id);
  if (!tu) throw new MockHttpError('NOT_FOUND', 404, 'User not found');
  return tu;
}

/** Audit snapshot — never includes the password. */
function auditUser(ctx: MockContext, tu: TenantUser) {
  const { isYou: _, ...view } = userView(ctx, tu);
  return view;
}

// ── SET-004 Roles ─────────────────────────────────────────────────────────────

function roleView(role: Role): SettingsRole {
  return {
    ...role,
    userCount: db.get().tenantUsers.filter((t) => t.roleIds.includes(role.id)).length,
  };
}

function roleOr404(ctx: MockContext, id: string): Role {
  const role = db.get().roles.find((r) => r.id === id && r.tenantId === ctx.me.tenant.id);
  if (!role) throw new MockHttpError('NOT_FOUND', 404, 'Role not found');
  return role;
}

function requireUniqueRoleName(ctx: MockContext, name: string, exceptId?: string) {
  const taken = db
    .get()
    .roles.some(
      (r) =>
        r.tenantId === ctx.me.tenant.id &&
        r.id !== exceptId &&
        r.name.toLowerCase() === name.toLowerCase(),
    );
  if (taken) throw fieldConflict('Role name already used', { name: 'validation.nameTaken' });
}

function roleCode(ctx: MockContext, name: string): string {
  const base =
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'ROLE';
  const used = new Set(
    db
      .get()
      .roles.filter((r) => r.tenantId === ctx.me.tenant.id)
      .map((r) => r.code),
  );
  let code = base;
  for (let n = 2; used.has(code); n++) code = `${base}_${n}`;
  return code;
}

function requireUnlocked(role: Role) {
  if (role.locked) throw conflict(`${role.name} can't be changed`, 'ROLE_LOCKED');
}

export const settingsHandlers = [
  // ── SET-007 ──
  http.get(
    `${API}/settings/charges`,
    handle(({ request }) => {
      const ctx = admin(request);
      const url = new URL(request.url);
      const location = tenantLocation(
        ctx,
        url.searchParams.get('locationId') ?? ctx.me.currentLocation?.id ?? '',
      );
      return HttpResponse.json<ChargeSettings>(chargeSettings(location.id));
    }),
  ),
  http.put(
    `${API}/settings/charges/:locationId`,
    handle(async ({ request, params }) => {
      const ctx = admin(request);
      const location = tenantLocation(ctx, String(params.locationId));
      const body = await parseBody(request, chargeSettingsSchema);
      const before = chargeSettings(location.id);
      const offered: ChargeType[] = CHARGE_CODES.flatMap((code) => {
        const c = body.charges.find((x) => x.code === code);
        if (!c?.offered) return [];
        return [
          {
            code,
            name: c.name,
            mode: c.mode,
            defaultValue: c.defaultValue,
            automatic: c.automatic,
          },
        ];
      });
      const service = offered.find((c) => c.code === 'SERVICE');
      db.update((d) => {
        d.chargeTypes[location.id] = offered;
        // One source for the automatic service rate that order totals use (A-206).
        posRow(d, location.id).serviceChargeBps = service?.automatic
          ? (service.defaultValue ?? 0)
          : 0;
      });
      const after = chargeSettings(location.id);
      recordAudit(ctx, {
        action: 'settings.charges.update',
        entity: 'location',
        entityId: location.id,
        entityLabel: location.name,
        before,
        after,
      });
      return HttpResponse.json<ChargeSettings>(after);
    }),
  ),

  // ── SET-002 ──
  http.get(
    `${API}/settings/locations`,
    handle(({ request }) => {
      const ctx = admin(request);
      return HttpResponse.json<SettingsLocation[]>(
        db
          .get()
          .locations.filter((l) => l.tenantId === ctx.me.tenant.id)
          .map(locationView),
      );
    }),
  ),
  http.post(
    `${API}/settings/locations`,
    handle(async ({ request }) => {
      const ctx = admin(request);
      const body = await parseBody(request, locationSchema);
      const isActive = body.isActive ?? true;
      if (isActive) checkLimit(ctx, 'locations', activeLocations(ctx).length);
      requireUniqueLocationCode(ctx, body.code);
      const location: Location = {
        id: newId('loc') as Location['id'],
        tenantId: ctx.me.tenant.id,
        code: body.code,
        name: body.name,
        type: body.type,
        address: body.address,
        isActive,
      };
      db.update((d) => {
        d.locations.push(location);
        Object.assign(posRow(d, location.id), body.pos);
        // No charges and no products until the admin switches them on (SET-007, CAT-004).
        d.chargeTypes[location.id] = [];
      });
      const view = locationView(location);
      recordAudit(ctx, {
        action: 'settings.location.create',
        entity: 'location',
        entityId: location.id,
        entityLabel: location.name,
        before: null,
        after: view,
      });
      return HttpResponse.json<SettingsLocation>(view, { status: 201 });
    }),
  ),
  http.put(
    `${API}/settings/locations/:id`,
    handle(async ({ request, params }) => {
      const ctx = admin(request);
      const location = tenantLocation(ctx, String(params.id));
      const body = await parseBody(request, locationSchema);
      const isActive = body.isActive ?? location.isActive;
      requireUniqueLocationCode(ctx, body.code, location.id);
      if (location.isActive && !isActive) {
        if (ctx.me.currentLocation?.id === location.id) {
          throw conflict("You can't deactivate the location you're working in", 'CURRENT_LOCATION');
        }
        if (activeLocations(ctx).length <= 1) {
          throw conflict('At least one location must stay active', 'LAST_LOCATION');
        }
      }
      if (!location.isActive && isActive) checkLimit(ctx, 'locations', activeLocations(ctx).length);
      const before = locationView(location);
      db.update((d) => {
        const row = d.locations.find((l) => l.id === location.id)!;
        Object.assign(row, {
          code: body.code,
          name: body.name,
          type: body.type,
          address: body.address,
          isActive,
        });
        Object.assign(posRow(d, location.id), body.pos);
      });
      const view = locationView(tenantLocation(ctx, location.id));
      recordAudit(ctx, {
        action: 'settings.location.update',
        entity: 'location',
        entityId: location.id,
        entityLabel: view.name,
        before,
        after: view,
      });
      return HttpResponse.json<SettingsLocation>(view);
    }),
  ),

  // ── SET-003 ──
  http.get(
    `${API}/settings/users`,
    handle(({ request }) => {
      const ctx = admin(request);
      const url = new URL(request.url);
      const search = url.searchParams.get('search')?.trim().toLowerCase();
      const status = url.searchParams.get('status') as UserStatus | null;
      const rows = db
        .get()
        .tenantUsers.filter((t) => t.tenantId === ctx.me.tenant.id)
        .map((t) => userView(ctx, t))
        .filter(
          (u) =>
            (!status || u.status === status) &&
            (!search ||
              u.displayName.toLowerCase().includes(search) ||
              u.email.toLowerCase().includes(search)),
        )
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
      return HttpResponse.json<SettingsUser[]>(rows);
    }),
  ),
  http.post(
    `${API}/settings/users`,
    handle(async ({ request }) => {
      const ctx = admin(request);
      const body = await parseBody(request, userCreateSchema);
      const status = body.status ?? 'ACTIVE';
      if (status === 'ACTIVE') checkLimit(ctx, 'users', activeUsers(ctx).length);
      requireUniqueEmail(body.email);
      checkUserRefs(ctx, body);
      const user = {
        id: newId('usr') as User['id'],
        email: body.email,
        displayName: body.displayName,
        password: body.password,
      };
      const tu: TenantUser = {
        id: newId('tu') as TenantUser['id'],
        tenantId: ctx.me.tenant.id,
        userId: user.id,
        roleIds: body.roleIds as TenantUser['roleIds'],
        locationIds: body.locationIds as TenantUser['locationIds'],
        ...(body.employeeId ? { employeeId: body.employeeId as TenantUser['employeeId'] } : {}),
        status,
      };
      db.update((d) => {
        d.users.push(user);
        d.tenantUsers.push(tu);
      });
      recordAudit(ctx, {
        action: 'settings.user.create',
        entity: 'user',
        entityId: tu.id,
        entityLabel: user.displayName,
        before: null,
        after: auditUser(ctx, tu),
      });
      return HttpResponse.json<SettingsUser>(userView(ctx, tu), { status: 201 });
    }),
  ),
  http.put(
    `${API}/settings/users/:id`,
    handle(async ({ request, params }) => {
      const ctx = admin(request);
      const existing = tenantUserOr404(ctx, String(params.id));
      const body = await parseBody(request, userSchema);
      const status = body.status ?? existing.status;
      requireUniqueEmail(body.email, existing.userId);
      checkUserRefs(ctx, body, existing.id);
      if (status === 'INACTIVE' && existing.id === ctx.me.tenantUser.id) {
        throw conflict("You can't deactivate your own sign-in", 'SELF_DEACTIVATE');
      }
      if (existing.status === 'INACTIVE' && status === 'ACTIVE') {
        checkLimit(ctx, 'users', activeUsers(ctx).length);
      }
      const next: TenantUser = {
        ...existing,
        roleIds: body.roleIds as TenantUser['roleIds'],
        locationIds: body.locationIds as TenantUser['locationIds'],
        status,
      };
      if (body.employeeId) next.employeeId = body.employeeId as TenantUser['employeeId'];
      else delete next.employeeId;
      const state = db.get();
      requireAnAdmin(
        ctx.me.tenant.id,
        state.tenantUsers.map((t) => (t.id === next.id ? next : t)),
        state.roles,
      );
      const before = auditUser(ctx, existing);
      db.update((d) => {
        const i = d.tenantUsers.findIndex((t) => t.id === next.id);
        d.tenantUsers[i] = next;
        const user = d.users.find((u) => u.id === existing.userId)!;
        user.email = body.email;
        user.displayName = body.displayName;
      });
      const after = auditUser(ctx, next);
      recordAudit(ctx, {
        action: 'settings.user.update',
        entity: 'user',
        entityId: next.id,
        entityLabel: after.displayName,
        before,
        after,
      });
      return HttpResponse.json<SettingsUser>(userView(ctx, next));
    }),
  ),
  http.post(
    `${API}/settings/users/:id/password`,
    handle(async ({ request, params }) => {
      const ctx = admin(request);
      const tu = tenantUserOr404(ctx, String(params.id));
      const { password } = await parseBody(request, passwordResetSchema);
      db.update((d) => {
        d.users.find((u) => u.id === tu.userId)!.password = password;
      });
      const label = userView(ctx, tu).displayName;
      // The password itself is never recorded.
      recordAudit(ctx, {
        action: 'settings.user.password',
        entity: 'user',
        entityId: tu.id,
        entityLabel: label,
        before: null,
        after: null,
      });
      return new HttpResponse(null, { status: 204 });
    }),
  ),

  // ── SET-004 ──
  http.get(
    `${API}/settings/roles`,
    handle(({ request }) => {
      const ctx = admin(request);
      return HttpResponse.json<SettingsRole[]>(
        db
          .get()
          .roles.filter((r) => r.tenantId === ctx.me.tenant.id)
          .map(roleView),
      );
    }),
  ),
  http.post(
    `${API}/settings/roles`,
    handle(async ({ request }) => {
      const ctx = admin(request);
      const body = await parseBody(request, roleSchema);
      requireUniqueRoleName(ctx, body.name);
      const role: Role = {
        id: newId('rol') as Role['id'],
        tenantId: ctx.me.tenant.id,
        code: roleCode(ctx, body.name),
        name: body.name,
        permissions: body.permissions,
      };
      db.update((d) => {
        d.roles.push(role);
      });
      recordAudit(ctx, {
        action: 'settings.role.create',
        entity: 'role',
        entityId: role.id,
        entityLabel: role.name,
        before: null,
        after: role,
      });
      return HttpResponse.json<SettingsRole>(roleView(role), { status: 201 });
    }),
  ),
  http.put(
    `${API}/settings/roles/:id`,
    handle(async ({ request, params }) => {
      const ctx = admin(request);
      const role = roleOr404(ctx, String(params.id));
      requireUnlocked(role);
      const body = await parseBody(request, roleSchema);
      requireUniqueRoleName(ctx, body.name, role.id);
      const next: Role = { ...role, name: body.name, permissions: body.permissions };
      const state = db.get();
      requireAnAdmin(
        ctx.me.tenant.id,
        state.tenantUsers,
        state.roles.map((r) => (r.id === role.id ? next : r)),
      );
      db.update((d) => {
        const i = d.roles.findIndex((r) => r.id === role.id);
        d.roles[i] = next;
      });
      recordAudit(ctx, {
        action: 'settings.role.update',
        entity: 'role',
        entityId: role.id,
        entityLabel: next.name,
        before: role,
        after: next,
      });
      return HttpResponse.json<SettingsRole>(roleView(next));
    }),
  ),
  http.delete(
    `${API}/settings/roles/:id`,
    handle(({ request, params }) => {
      const ctx = admin(request);
      const role = roleOr404(ctx, String(params.id));
      requireUnlocked(role);
      const { userCount } = roleView(role);
      if (userCount > 0) {
        throw conflict(`${userCount} sign-ins still have this role`, 'ROLE_IN_USE', {
          count: userCount,
        });
      }
      db.update((d) => {
        d.roles = d.roles.filter((r) => r.id !== role.id);
      });
      recordAudit(ctx, {
        action: 'settings.role.delete',
        entity: 'role',
        entityId: role.id,
        entityLabel: role.name,
        before: role,
        after: null,
      });
      return new HttpResponse(null, { status: 204 });
    }),
  ),
];
