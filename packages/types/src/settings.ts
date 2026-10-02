import type { KitchenStation } from './catalog';
import type { EmployeeId, LanguageCode, LocationId, RoleId, TenantUserId, UserId } from './common';
import type { Device, Location, LocationType, Role, Tenant, UserStatus } from './identity';
import type { PaymentMethod } from './order';
import type { AdjustmentMode, ChargeCode, PosSettings } from './pos';
import type { FeatureCode, LimitCode, Permission } from './saas';

/** SET-* admin screens (settings.manage). */

/** SET-007: one row per charge code; `offered` = shown on this location's POS. */
export interface ChargeSetting {
  code: ChargeCode;
  offered: boolean;
  name: string;
  mode: AdjustmentMode;
  /** Basis points (PERCENT) or minor units (FIXED); null = staff enter it. */
  defaultValue: number | null;
  automatic: boolean;
}

export interface ChargeSettings {
  locationId: LocationId;
  charges: ChargeSetting[];
}

export interface ChargeSettingsRequest {
  charges: ChargeSetting[];
}

/** SET-002: the location's POS settings minus the service rate (set on SET-007). */
/** Receipt printer is set on SET-008. */
export type LocationPosSettings = Omit<
  PosSettings,
  'locationId' | 'serviceChargeBps' | 'receiptPrinter'
>;

export interface SettingsLocation extends Location {
  pos: LocationPosSettings;
  serviceChargeBps: number;
  /** Logins that can open it (including "all locations" logins). */
  userCount: number;
}

export interface LocationRequest {
  code: string;
  name: string;
  type: LocationType;
  address: string;
  isActive?: boolean;
  pos: LocationPosSettings;
}

/** SET-003 */
export interface SettingsUser {
  id: TenantUserId;
  userId: UserId;
  email: string;
  displayName: string;
  status: UserStatus;
  roles: { id: RoleId; name: string }[];
  /** Empty = all locations. */
  locationIds: LocationId[];
  employee: { id: EmployeeId; fullName: string } | null;
  /** The signed-in admin's own login. */
  isYou: boolean;
}

export interface SettingsUserListParams {
  search?: string;
  status?: UserStatus;
}

export interface UserRequest {
  email: string;
  displayName: string;
  roleIds: string[];
  /** Empty = all locations. */
  locationIds: string[];
  employeeId?: string | null;
  status?: UserStatus;
}

export interface UserCreateRequest extends UserRequest {
  password: string;
}

export interface PasswordResetRequest {
  password: string;
}

/** SET-004 */
export interface SettingsRole extends Role {
  userCount: number;
}

export interface RoleRequest {
  name: string;
  permissions: Permission[];
}

/** SET-001 */
export interface BusinessSettings {
  name: string;
  /** 1–3 letters shown as the logo badge. */
  logoText: string;
  /** null = the app's default colour. */
  primaryColor: string | null;
  phone: string;
  taxRegNo: string;
  timezone: string;
  /** Read-only: changing it would re-value every price. */
  currency: Tenant['currency'];
}

export type BusinessRequest = Omit<BusinessSettings, 'currency'>;

/** SET-005 */
export interface SettingsDevice extends Device {
  locationName: string;
  /** 6 digits entered on the device to pair it (simulated). */
  activationCode: string;
  paired: boolean;
}

export interface DeviceRequest {
  name: string;
  type: Device['type'];
  locationId: string;
  isActive?: boolean;
}

/** SET-006: business-wide; cash is always on. */
export interface PaymentMethodSetting {
  method: PaymentMethod;
  enabled: boolean;
}

export interface PaymentSettingsRequest {
  methods: PaymentMethodSetting[];
}

/** SET-008 */
export interface SettingsStation extends KitchenStation {
  /** Products at this location routed to the station. */
  productCount: number;
}

export interface PrinterSettings {
  locationId: LocationId;
  receiptPrinter: string;
  stations: SettingsStation[];
}

export interface StationRequest {
  locationId: string;
  code: string;
  name: string;
  printerName: string;
}

/** SET-009 */
export interface LanguageSettings {
  defaultLanguage: LanguageCode;
  languages: LanguageCode[];
  /** How many active products/categories have a name in each extra language. */
  coverage: {
    language: LanguageCode;
    products: number;
    productsTranslated: number;
    categories: number;
    categoriesTranslated: number;
  }[];
}

export interface LanguageRequest {
  defaultLanguage: LanguageCode;
  languages: LanguageCode[];
}

/** SET-010 (read-only; the platform manages entitlements, ADR-011). */
export interface FeatureSettings {
  status: Tenant['status'];
  features: { code: FeatureCode; enabled: boolean }[];
  limits: { code: LimitCode; used: number; max: number | null }[];
}
