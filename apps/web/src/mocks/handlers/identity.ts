import {
  type EmployeeVerification,
  type EmployeeVerificationRequest,
  isSensitiveAction,
  SENSITIVE_ACTIONS,
} from '@rbp/types';
import { addMinutes, newId, nowIso } from '@rbp/utils';
import { http, HttpResponse } from 'msw';
import { employeePermissions } from '../audit';
import { resolveContext } from '../context';
import { db } from '../db';
import { API, handle, MockHttpError } from '../http';

const MAX_PIN_ATTEMPTS = 5;
/** While locked, every PIN — even a correct one — is refused, so a PIN can't be brute-forced. */
const PIN_LOCK_MINUTES = 5;

export const identityHandlers = [
  http.get(
    `${API}/me`,
    handle(({ request }) => HttpResponse.json(resolveContext(request).me)),
  ),

  http.get(
    `${API}/locations`,
    handle(({ request }) => HttpResponse.json(resolveContext(request).me.locations)),
  ),

  /** Devices at the user's allowed locations (CAT-007 per-device layouts, device pickers). */
  http.get(
    `${API}/devices`,
    handle(({ request }) => {
      const ctx = resolveContext(request);
      const locationId = new URL(request.url).searchParams.get('locationId');
      const allowed = new Set(ctx.me.locations.map((l) => l.id as string));
      return HttpResponse.json(
        db
          .get()
          .devices.filter(
            (d) =>
              d.tenantId === ctx.me.tenant.id &&
              d.isActive &&
              allowed.has(d.locationId) &&
              (!locationId || d.locationId === locationId),
          ),
      );
    }),
  ),

  /** AUTH-004 / POS-006: verify the employee performing a sensitive action on a shared device. */
  http.post(
    `${API}/employee-verifications`,
    handle(async ({ request }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      const { pin, action } = (await request.json()) as EmployeeVerificationRequest;
      if (!/^\d{4}$/.test(pin ?? '')) {
        throw new MockHttpError('VALIDATION_FAILED', 400, 'PIN must be 4 digits', { field: 'pin' });
      }
      if (!isSensitiveAction(action)) {
        throw new MockHttpError('VALIDATION_FAILED', 400, 'Unknown action', { field: 'action' });
      }
      const location = ctx.me.currentLocation!;
      const candidates = db
        .get()
        .employees.filter(
          (e) =>
            e.tenantId === ctx.me.tenant.id && e.isActive && e.locationIds.includes(location.id),
        );
      const employee = candidates.find((e) => e.pin === pin);

      // Per-device failure counter stands in for real per-employee lockout.
      const key = `${ctx.me.tenant.id}:${ctx.me.device?.id ?? 'no-device'}`;
      const lockedUntil = db.get().pinLocks?.[key];
      if (lockedUntil && lockedUntil > nowIso()) {
        throw new MockHttpError('EMPLOYEE_LOCKED', 423, 'Too many failed attempts', {
          lockedUntil,
        });
      }

      if (!employee) {
        let failures = 0;
        db.update((d) => {
          failures = (d.pinFailures[key] ?? 0) + 1;
          d.pinFailures[key] = failures;
        });
        if (failures >= MAX_PIN_ATTEMPTS) {
          const until = addMinutes(nowIso(), PIN_LOCK_MINUTES);
          db.update((d) => {
            d.pinLocks = { ...d.pinLocks, [key]: until };
            d.pinFailures[key] = 0;
          });
          throw new MockHttpError('EMPLOYEE_LOCKED', 423, 'Too many failed attempts', {
            attempts: failures,
            lockedUntil: until,
          });
        }
        throw new MockHttpError('INVALID_PIN', 422, 'Incorrect PIN', {
          attemptsRemaining: MAX_PIN_ATTEMPTS - failures,
        });
      }

      // Right person, wrong role: tell them now, before they type a reason. Not a failed attempt.
      const { permission } = SENSITIVE_ACTIONS[action];
      if (!employeePermissions(ctx.me.tenant.id, employee.id).has(permission)) {
        throw new MockHttpError(
          'EMPLOYEE_NOT_AUTHORIZED',
          403,
          `${employee.fullName} cannot ${permission}`,
          { employee: employee.fullName, permission, action },
        );
      }

      db.update((d) => {
        d.pinFailures = Object.fromEntries(
          Object.entries(d.pinFailures).filter(([k]) => !k.startsWith(`${ctx.me.tenant.id}:`)),
        );
      });
      const verifiedAt = nowIso();
      const verificationId = newId('ver');
      const expiresAt = addMinutes(verifiedAt, 2);
      db.update((d) => {
        d.verifications.push({
          id: verificationId,
          tenantId: ctx.me.tenant.id,
          employeeId: employee.id,
          action,
          expiresAt,
          usedAt: null,
        });
      });
      console.info('[mock audit] employee verified', {
        employee: employee.code,
        action,
        location: location.code,
      });
      return HttpResponse.json<EmployeeVerification>({
        verificationId,
        employee: {
          id: employee.id,
          code: employee.code,
          fullName: employee.fullName,
          jobTitle: employee.jobTitle,
        },
        verifiedAt,
        expiresAt,
        action,
      });
    }),
  ),
];
