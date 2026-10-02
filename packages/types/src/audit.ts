import type { Employee } from './identity';
import type { IsoDateTime } from './common';

/** Tenant-configured reason for an important change (REQ-268…287, POS-007). */
export interface Reason {
  code: string;
  label: string;
  /** "Other" style reasons need a free-text comment. */
  requiresComment: boolean;
  /** Sensitive action codes it's offered for; empty/absent = every action. */
  appliesTo?: string[];
}

/**
 * Proof attached to a sensitive write: which employee confirmed it with their PIN (AUTH-004)
 * and why (POS-007). The server re-checks the employee's permission and records both in the audit log.
 */
export interface SensitiveActionContext {
  verificationId: string;
  reasonCode: string;
  reasonComment?: string;
}

/** Immutable audit record (REQ-236…264, REQ-969…986). Never edited or deleted. */
export interface AuditEvent {
  id: string;
  tenantId: string;
  locationId: string | null;
  deviceId: string | null;
  userId: string;
  userName: string;
  /** Employee who confirmed the action with a PIN, when one was required. */
  employee: Pick<Employee, 'id' | 'code' | 'fullName'> | null;
  /** Permission the employee's PIN authorised (sensitive actions only). */
  permission: string | null;
  /** Permission-style action code, e.g. `catalog.price.change`. */
  action: string;
  entity: string;
  entityId: string;
  /** Human-readable label of the entity at the time (e.g. product name). */
  entityLabel?: string;
  before: unknown;
  after: unknown;
  reason: { code: string; label: string; comment?: string } | null;
  /** Names captured at the time, so history reads right after renames. */
  locationName: string | null;
  deviceName: string | null;
  at: IsoDateTime;
}

export interface AuditListParams {
  page?: number;
  pageSize?: number;
  entity?: string;
  entityId?: string;
  action?: string;
  /** Action code prefix, e.g. "pos." or "catalog.". */
  actionPrefix?: string;
  employeeId?: string;
  userId?: string;
  /** ISO timestamps. */
  from?: string;
  to?: string;
  search?: string;
  /** Only events approved with an employee PIN. */
  sensitive?: boolean;
  /** REP-006 events at one location. */
  locationId?: string;
}
