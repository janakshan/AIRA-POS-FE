import type { SensitiveActionContext } from './audit';
import type { IsoDateTime, LocationId } from './common';

/** Per-location POS settings used for sale totals (REQ-463…483, REQ-896…912). */
export interface PosSettings {
  locationId: LocationId;
  /** Service charge in basis points (1000 = 10%), applied to lines flagged `serviceCharge`. */
  serviceChargeBps: number;
  /** Tax in basis points, added to tax-EXCLUSIVE lines (INCLUSIVE prices already contain it). */
  taxRateBps: number;
  /** e.g. "VAT". */
  taxLabel: string;
  /** Largest percentage discount staff may approve (basis points). */
  maxDiscountBps: number;
  /** Days after sale that returns are accepted. */
  returnWindowDays: number;
  receiptFooter: string;
  /** Simulated receipt printer receipts go to (SET-008). */
  receiptPrinter: string;
}

export type AdjustmentMode = 'PERCENT' | 'FIXED';
export type ChargeCode = 'SERVICE' | 'DELIVERY' | 'PACKAGING' | 'OTHER';

/** POS-005 configurable charge (REQ-463…483). */
export interface ChargeType {
  code: ChargeCode;
  name: string;
  mode: AdjustmentMode;
  /** Basis points (PERCENT) or minor units (FIXED); null = no default (staff enter it). */
  defaultValue: number | null;
  /** Applied to every sale without staff action (e.g. restaurant service charge). */
  automatic: boolean;
}

/** POS-004 promotional discount configured by the admin (REQ-485…491). */
export interface Promotion {
  code: string;
  name: string;
  mode: AdjustmentMode;
  value: number;
  scope: 'ORDER' | 'LINE';
}

/**
 * An approved discount or charge on a sale. Created (and audited) by the server before it
 * affects the draft; removing it voids the record — it's never deleted.
 */
export interface SaleAdjustment {
  id: string;
  /** PRICE = POS line price change: `value` is the new unit price (minor units). */
  kind: 'DISCOUNT' | 'CHARGE' | 'PRICE';
  scope: 'ORDER' | 'LINE';
  /** LINE scope only. */
  productId?: string;
  mode: AdjustmentMode;
  /** Basis points (PERCENT) or minor units (FIXED). */
  value: number;
  promotionCode?: string;
  chargeCode?: ChargeCode;
  /** Shown on the receipt/totals, e.g. "Loyalty Rs 100 off", "Delivery". */
  label: string;
  /** PRICE only: the catalog price it replaced. */
  previousValue?: number;
  status: 'ACTIVE' | 'VOIDED';
  reason: { code: string; label: string; comment?: string } | null;
  approvedBy: { id: string; fullName: string } | null;
  createdBy: string;
  createdAt: IsoDateTime;
  locationId: LocationId;
  deviceId: string | null;
}

export interface CreateAdjustmentRequest {
  kind: 'DISCOUNT' | 'CHARGE' | 'PRICE';
  scope: 'ORDER' | 'LINE';
  productId?: string;
  /** Promotions take mode/value from the server; omit mode/value when set. */
  promotionCode?: string;
  chargeCode?: ChargeCode;
  mode?: AdjustmentMode;
  value?: number;
  label?: string;
  verification?: SensitiveActionContext;
}

/** POS drawer kick outside a sale (PIN + reason, audited). */
export interface DrawerEventRequest {
  verification: SensitiveActionContext;
}

export interface VoidAdjustmentRequest {
  verification?: SensitiveActionContext;
  /** System voids (e.g. sale cleared) don't need a verification. */
  system?: 'SALE_CLEARED';
}
