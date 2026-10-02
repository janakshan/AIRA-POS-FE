import { ApiError } from '@rbp/api-client';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session-store';

async function signInAs(email: string) {
  const { accessToken } = await api.auth.login({ email, password: 'demo1234' });
  useSessionStore.getState().signIn(accessToken);
}

describe('mock identity API', () => {
  it('rejects bad credentials with a stable error code', async () => {
    await expect(
      api.auth.login({ email: 'owner@pilot.demo', password: 'wrong' }),
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('derives tenant, permissions and features from the token', async () => {
    await signInAs('cashier@pilot.demo');
    const me = await api.identity.me();
    expect(me.tenant.code).toBe('T001');
    expect(me.permissions).toContain('pos.sale.create');
    expect(me.permissions).not.toContain('settings.manage');
    expect(me.locations.map((l) => l.code)).toEqual(['MAIN']);
  });

  it('does not let a tenant user select another tenant’s location', async () => {
    await signInAs('owner@grocery.demo');
    useSessionStore.getState().setLocation('loc_01MAIN');
    const error = await api.identity.me().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('LOCATION_NOT_ALLOWED');
  });

  it('lists only the locations the tenant user is assigned to', async () => {
    await signInAs('manager@pilot.demo');
    const locations = await api.identity.locations();
    expect(locations.map((l) => l.code).sort()).toEqual(['BAK', 'MAIN']);

    await signInAs('owner@grocery.demo');
    expect((await api.identity.locations()).map((l) => l.code)).toEqual(['TWN']);
  });

  it('rejects a location header for a location of the same tenant the user is not assigned to', async () => {
    await signInAs('cashier@pilot.demo');
    useSessionStore.getState().setLocation('loc_01BAKERY');
    await expect(api.identity.me()).rejects.toMatchObject({
      code: 'LOCATION_NOT_ALLOWED',
      status: 403,
    });
  });

  it('reflects the selected location in /me', async () => {
    await signInAs('manager@pilot.demo');
    expect((await api.identity.me()).currentLocation).toBeNull();
    useSessionStore.getState().setLocation('loc_01BAKERY');
    expect((await api.identity.me()).currentLocation?.code).toBe('BAK');
  });

  it('verifies employee PINs only for the current tenant and location', async () => {
    await signInAs('manager@pilot.demo');
    useSessionStore.getState().setLocation('loc_01MAIN');
    const ok = await api.identity.verifyEmployee({ pin: '3333', action: 'pos.drawer.open' });
    expect(ok.employee.fullName).toBe('Fathima Rizvi');
    // Priya works at the bakery, not the main restaurant.
    await expect(
      api.identity.verifyEmployee({ pin: '6666', action: 'pos.drawer.open' }),
    ).rejects.toMatchObject({
      code: 'INVALID_PIN',
    });
  });

  it('locks after repeated wrong PINs', async () => {
    await signInAs('manager@pilot.demo');
    useSessionStore.getState().setLocation('loc_01MAIN');
    const codes: string[] = [];
    for (let i = 0; i < 5; i++) {
      codes.push(
        await api.identity.verifyEmployee({ pin: '9999', action: 'pos.drawer.open' }).then(
          () => 'OK',
          (e: ApiError) => e.code,
        ),
      );
    }
    expect(codes.at(-1)).toBe('EMPLOYEE_LOCKED');
    // Locked means locked: the right PIN is refused too until the lock expires.
    await expect(
      api.identity.verifyEmployee({ pin: '2222', action: 'pos.drawer.open' }),
    ).rejects.toMatchObject({ code: 'EMPLOYEE_LOCKED' });
  });
});
