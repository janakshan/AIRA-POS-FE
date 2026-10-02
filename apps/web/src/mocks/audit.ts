import {
  type AuditEvent,
  type Employee,
  type Permission,
  SENSITIVE_ACTIONS,
  type SensitiveActionCode,
  type SensitiveActionContext,
} from '@rbp/types';
import { newId, nowIso } from '@rbp/utils';
import type { MockContext } from './context';
import { db } from './db';
import { MockHttpError } from './http';

export interface VerifiedAction {
  employee: Pick<Employee, 'id' | 'code' | 'fullName'>;
  reason: NonNullable<AuditEvent['reason']>;
  permission: Permission;
}

/** Permissions an employee holds through the tenant user linked to them (none if unlinked). */
export function employeePermissions(tenantId: string, employeeId: string): Set<Permission> {
  const state = db.get();
  const tenantUser = state.tenantUsers.find(
    (t) => t.tenantId === tenantId && t.employeeId === employeeId,
  );
  if (!tenantUser) return new Set();
  return new Set(
    state.roles.filter((r) => tenantUser.roleIds.includes(r.id)).flatMap((r) => r.permissions),
  );
}

/**
 * Server side of FLOW-POS-002 for a sensitive action (see SENSITIVE_ACTIONS): the request must
 * carry a live, unused PIN verification issued **for this action** by an employee holding its
 * permission, plus a reason that applies to it. The verification is consumed.
 */
export function requireVerifiedAction(
  ctx: MockContext,
  input: SensitiveActionContext | undefined,
  action: SensitiveActionCode,
): VerifiedAction {
  const { permission } = SENSITIVE_ACTIONS[action];
  if (!input) {
    throw new MockHttpError('VERIFICATION_REQUIRED', 428, 'Employee verification required', {
      action,
      permission,
    });
  }
  const state = db.get();
  const record = state.verifications.find(
    (v) => v.id === input.verificationId && v.tenantId === ctx.me.tenant.id,
  );
  if (!record || record.usedAt || record.expiresAt < nowIso()) {
    throw new MockHttpError('VERIFICATION_REQUIRED', 428, 'Verification expired or already used', {
      action,
      permission,
    });
  }
  if (record.action !== action) {
    throw new MockHttpError('VERIFICATION_REQUIRED', 428, 'Verification was for another action', {
      action,
      permission,
      reason: 'ACTION_MISMATCH',
    });
  }
  const employee = state.employees.find((e) => e.id === record.employeeId)!;
  // Re-checked here too: roles can change between verification and use.
  if (!employeePermissions(ctx.me.tenant.id, employee.id).has(permission)) {
    throw new MockHttpError(
      'EMPLOYEE_NOT_AUTHORIZED',
      403,
      `${employee.fullName} cannot ${permission}`,
      {
        permission,
        employee: employee.fullName,
      },
    );
  }
  const reason = (state.reasons[ctx.me.tenant.id] ?? []).find(
    (r) => r.code === input.reasonCode && (!r.appliesTo?.length || r.appliesTo.includes(action)),
  );
  if (!reason) {
    throw new MockHttpError('VALIDATION_FAILED', 400, 'Reason not valid for this action', {
      fieldErrors: { reasonCode: 'validation.reasonRequired' },
    });
  }
  if (reason.requiresComment && (input.reasonComment ?? '').trim().length < 3) {
    throw new MockHttpError('VALIDATION_FAILED', 400, 'Comment required', {
      fieldErrors: { reasonComment: 'validation.commentRequired' },
    });
  }
  db.update((d) => {
    const v = d.verifications.find((x) => x.id === record.id);
    if (v) v.usedAt = nowIso();
  });
  return {
    employee: { id: employee.id, code: employee.code, fullName: employee.fullName },
    permission,
    reason: {
      code: reason.code,
      label: reason.label,
      ...(input.reasonComment ? { comment: input.reasonComment } : {}),
    },
  };
}

/** Append an immutable audit event for a write (INS-212…229). Never edited or removed. */
export function recordAudit(
  ctx: MockContext,
  event: Pick<AuditEvent, 'action' | 'entity' | 'entityId' | 'before' | 'after'> & {
    entityLabel?: string;
    verified?: VerifiedAction;
  },
): void {
  const { verified, ...rest } = event;
  db.update((d) => {
    d.auditLog.unshift({
      id: newId('aud'),
      tenantId: ctx.me.tenant.id,
      locationId: ctx.me.currentLocation?.id ?? null,
      locationName: ctx.me.currentLocation?.name ?? null,
      deviceId: ctx.me.device?.id ?? null,
      deviceName: ctx.me.device?.name ?? null,
      userId: ctx.me.user.id,
      userName: ctx.me.user.displayName,
      employee: verified?.employee ?? null,
      permission: verified?.permission ?? null,
      reason: verified?.reason ?? null,
      at: nowIso(),
      ...rest,
    });
  });
}
