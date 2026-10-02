import type { FeatureCode, Location, MeResponse, Permission, Role } from '@rbp/types';
import { db } from './db';
import { MockHttpError } from './http';

/**
 * Mirrors the backend auth context: tenant and user are derived from the token,
 * never from a browser-supplied tenant id. Location/device come from headers and are validated.
 */
const TOKEN_PREFIX = 'mock.';

export function issueToken(tenantUserId: string): string {
  return `${TOKEN_PREFIX}${btoa(JSON.stringify({ tu: tenantUserId, iat: Date.now() }))}`;
}

function parseToken(header: string | null): string | null {
  const token = header?.replace(/^Bearer\s+/i, '');
  if (!token?.startsWith(TOKEN_PREFIX)) return null;
  try {
    const payload = JSON.parse(atob(token.slice(TOKEN_PREFIX.length))) as { tu?: string };
    return payload.tu ?? null;
  } catch {
    return null;
  }
}

export interface MockContext {
  me: MeResponse;
  permissions: Set<Permission>;
  features: Set<FeatureCode>;
}

export function allowedLocations(tenantId: string, locationIds: string[]): Location[] {
  return db
    .get()
    .locations.filter(
      (l) =>
        l.tenantId === tenantId &&
        l.isActive &&
        (locationIds.length === 0 || locationIds.includes(l.id)),
    );
}

export function resolveContext(
  request: Request,
  opts: { requireLocation?: boolean } = {},
): MockContext {
  const state = db.get();
  const tenantUserId = parseToken(request.headers.get('Authorization'));
  const tenantUser = state.tenantUsers.find((t) => t.id === tenantUserId);
  if (!tenantUser) throw new MockHttpError('UNAUTHENTICATED', 401, 'Not signed in');

  const tenant = state.tenants.find((t) => t.id === tenantUser.tenantId);
  const user = state.users.find((u) => u.id === tenantUser.userId);
  if (!tenant || !user)
    throw new MockHttpError('UNAUTHENTICATED', 401, 'Session is no longer valid');

  const roles: Role[] = state.roles.filter((r) => tenantUser.roleIds.includes(r.id));
  const permissions = [...new Set(roles.flatMap((r) => r.permissions))];
  const features = state.features[tenant.id] ?? [];
  const locations = allowedLocations(tenant.id, tenantUser.locationIds);

  const locationHeader = request.headers.get('X-Location-Id');
  let currentLocation: Location | null = null;
  if (locationHeader) {
    currentLocation = locations.find((l) => l.id === locationHeader) ?? null;
    if (!currentLocation) {
      throw new MockHttpError(
        'LOCATION_NOT_ALLOWED',
        403,
        'Location is not available to this user',
        {
          locationId: locationHeader,
        },
      );
    }
  } else if (opts.requireLocation) {
    throw new MockHttpError('VALIDATION_FAILED', 400, 'X-Location-Id header is required');
  }

  const deviceHeader = request.headers.get('X-Device-Id');
  const device =
    state.devices.find(
      (d) =>
        d.id === deviceHeader &&
        d.tenantId === tenant.id &&
        (!currentLocation || d.locationId === currentLocation.id),
    ) ?? null;

  const { password: _password, ...publicUser } = user;
  return {
    me: {
      user: publicUser,
      tenant,
      tenantUser,
      roles,
      permissions,
      features,
      limits: state.limits[tenant.id] ?? {},
      locations,
      currentLocation,
      device,
    },
    permissions: new Set(permissions),
    features: new Set(features),
  };
}

export function requirePermission(ctx: MockContext, permission: Permission): void {
  if (!ctx.permissions.has(permission)) {
    throw new MockHttpError('FORBIDDEN', 403, `Missing permission ${permission}`, { permission });
  }
}

export function requireFeature(ctx: MockContext, feature: FeatureCode): void {
  if (!ctx.features.has(feature)) {
    throw new MockHttpError('FEATURE_NOT_ENABLED', 403, `Feature ${feature} is not enabled`, {
      feature,
    });
  }
}
