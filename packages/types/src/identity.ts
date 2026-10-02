import type { SensitiveActionCode } from './sensitive-actions';
import type {
  CurrencyCode,
  DeviceId,
  EmployeeId,
  IsoDateTime,
  LanguageCode,
  LocationId,
  Money,
  RoleId,
  TenantId,
  TenantUserId,
  UserId,
} from './common';
import type { FeatureCode, LimitCode, Permission } from './saas';

export type TenantStatus = 'ACTIVE' | 'TRIAL' | 'SUSPENDED';

export interface TenantBranding {
  /** Any CSS colour (e.g. "oklch(0.55 0.2 260)") applied to the --primary token. */
  primaryColor?: string;
  logoText: string;
}

export interface Tenant {
  id: TenantId;
  code: string;
  name: string;
  status: TenantStatus;
  currency: CurrencyCode;
  defaultLanguage: LanguageCode;
  timezone: string;
  branding: TenantBranding;
  /** Printed under the business name on receipts (SET-001). */
  phone?: string;
  taxRegNo?: string;
  /** Languages staff may pick (SET-009); English is always included. */
  languages: LanguageCode[];
}

/** VAN = a field-sales vehicle holding stock (WHO-*). */
export type LocationType = 'RESTAURANT' | 'RETAIL' | 'BAKERY' | 'WAREHOUSE' | 'MIXED' | 'VAN';

export interface Location {
  id: LocationId;
  tenantId: TenantId;
  code: string;
  name: string;
  type: LocationType;
  address: string;
  isActive: boolean;
}

/** Login identity — not tenant-scoped. */
export interface User {
  id: UserId;
  email: string;
  displayName: string;
}

export interface Role {
  id: RoleId;
  tenantId: TenantId;
  code: string;
  name: string;
  permissions: Permission[];
  /** Owner/Admin: can't be edited or deleted, so the business can't lock itself out (SET-004). */
  locked?: boolean;
}

export type UserStatus = 'ACTIVE' | 'INACTIVE';

/** A user's membership/access inside a tenant. */
export interface TenantUser {
  id: TenantUserId;
  tenantId: TenantId;
  userId: UserId;
  roleIds: RoleId[];
  /** Locations the member may operate in. Empty = all tenant locations. */
  locationIds: LocationId[];
  employeeId?: EmployeeId;
  /** INACTIVE logins can't sign in; their sessions end on the next request (SET-003). */
  status: UserStatus;
}

/** Tenant staff record — verified by PIN at the POS for sensitive actions. */
export interface Employee {
  id: EmployeeId;
  tenantId: TenantId;
  code: string;
  fullName: string;
  jobTitle: string;
  locationIds: LocationId[];
  isActive: boolean;
  /** E.164 (HR-001). */
  phone?: string;
  /** §23 monthly staff food allowance (default Rs 5,000). */
  monthlyFoodAllowance?: Money;
  /** YYYY-MM-DD */
  joinedAt?: string;
}

export type DeviceType = 'POS_TERMINAL' | 'TABLET' | 'KITCHEN_DISPLAY' | 'BACK_OFFICE';

export interface Device {
  id: DeviceId;
  tenantId: TenantId;
  locationId: LocationId;
  name: string;
  type: DeviceType;
  /** Inactive devices are never resolved as the request's device (SET-005). */
  isActive: boolean;
}

export interface FeatureEntitlement {
  feature: FeatureCode;
  enabled: boolean;
}

/** Resolved request context — mirrors what the backend derives from auth. */
export interface MeResponse {
  user: User;
  tenant: Tenant;
  tenantUser: TenantUser;
  roles: Role[];
  permissions: Permission[];
  features: FeatureCode[];
  limits: Partial<Record<LimitCode, number>>;
  locations: Location[];
  currentLocation: Location | null;
  device: Device | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}

export interface EmployeeVerificationRequest {
  pin: string;
  /**
   * Sensitive action being authorised. The employee must hold its permission, and the
   * verification can only be used for this action.
   */
  action: SensitiveActionCode;
}

export interface EmployeeVerification {
  verificationId: string;
  employee: Pick<Employee, 'id' | 'code' | 'fullName' | 'jobTitle'>;
  verifiedAt: IsoDateTime;
  expiresAt: IsoDateTime;
  action: SensitiveActionCode;
}

/** Employee as listed for pickers and audit filters (never includes the PIN). */
export type EmployeeSummary = Pick<Employee, 'id' | 'code' | 'fullName' | 'jobTitle'>;

/** Dev/support-only tenant listing (AUTH-002). */
export interface TenantSummary {
  id: TenantId;
  code: string;
  name: string;
  status: TenantStatus;
}
