/** Opaque string identifiers (ULID). Branded to avoid mixing ID kinds. */
export type Id<Brand extends string> = string & { readonly __brand: Brand };

export type TenantId = Id<'Tenant'>;
export type LocationId = Id<'Location'>;
export type UserId = Id<'User'>;
export type TenantUserId = Id<'TenantUser'>;
export type EmployeeId = Id<'Employee'>;
export type RoleId = Id<'Role'>;
export type DeviceId = Id<'Device'>;
export type CategoryId = Id<'Category'>;
export type ProductId = Id<'Product'>;

/** ISO-8601 UTC timestamp, e.g. 2026-09-26T08:30:00.000Z */
export type IsoDateTime = string;

/** ISO-4217 currency code. */
export type CurrencyCode = 'LKR' | 'USD' | 'INR';

/**
 * Money is always stored in integer minor units (cents) — never floating point.
 * Rs. 800.00 => { amount: 80000, currency: 'LKR' }
 */
export interface Money {
  amount: number;
  currency: CurrencyCode;
}

export type LanguageCode = 'en' | 'ta' | 'si';

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
