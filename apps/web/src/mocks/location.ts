import type { MockContext } from './context';
import { db } from './db';
import { MockHttpError } from './http';

/** Location scoping shared by the REC-* and BAK-* handlers. */

export const myLocationIds = (ctx: MockContext) => ctx.me.locations.map((l) => l.id as string);

export function requireLocationAccess(ctx: MockContext, locationId: string) {
  if (!myLocationIds(ctx).includes(locationId)) {
    throw new MockHttpError('FORBIDDEN', 403, 'No access to that location', {
      reason: 'LOCATION_ACCESS',
      locationId,
    });
  }
}

/** `?locationId=` (must be allowed) or the current location. */
export function targetLocation(ctx: MockContext, url: URL) {
  const id = url.searchParams.get('locationId') ?? ctx.me.currentLocation?.id;
  if (!id) throw new MockHttpError('VALIDATION_FAILED', 400, 'Choose a location');
  requireLocationAccess(ctx, id);
  return id;
}

export const locationName = (id: string) => db.get().locations.find((l) => l.id === id)?.name ?? id;
