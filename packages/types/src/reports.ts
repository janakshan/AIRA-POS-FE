import type { IsoDateTime, LocationId, Money } from './common';
import type { StockStatus, StockUnit } from './inventory';
import type { OrderType, PaymentMethod } from './order';

/**
 * REP-001…006 reports (A-287…). Sales are paid POS orders recognised on the day they were
 * paid, less refunds (returns and voids) on the day they were refunded. Cancelled orders were
 * never sales. Wholesale and staff meals are shown as separate channels, not POS sales.
 */

export interface ReportParams {
  /** YYYY-MM-DD (local), inclusive. Default: 6 days ago. */
  from?: string;
  /** YYYY-MM-DD (local), inclusive. Default: today. */
  to?: string;
  /** A location id, or 'all' (every location the user can see). Default: all. */
  locationId?: string;
}

export interface SalesFigures {
  /** Before discounts. */
  gross: Money;
  discounts: Money;
  /** Service charge and other charges (delivery, packaging…). */
  charges: Money;
  tax: Money;
  /** What customers paid (order totals). */
  sales: Money;
  /** Returns and voids refunded in the period. */
  refunds: Money;
  /** sales − refunds. */
  net: Money;
  /** Paid orders not voided. */
  orders: number;
  items: number;
  averageOrder: Money;
}

export interface SalesSummaryReport {
  from: string;
  to: string;
  locationIds: LocationId[];
  totals: SalesFigures;
  byDay: { date: string; net: Money; orders: number }[];
  byHour: { hour: number; net: Money; orders: number }[];
  byPayment: { method: PaymentMethod; sales: Money; refunds: Money; net: Money; count: number }[];
  byType: { type: OrderType; net: Money; orders: number }[];
  byCashier: { name: string; net: Money; orders: number; discounts: Money }[];
  /** Not POS sales; shown so nothing is hidden (A-287). */
  channels: {
    wholesale: { invoices: number; total: Money; credit: Money; returns: Money };
    staffMeals: { meals: number; value: Money };
  };
}

export interface ProductSalesParams extends ReportParams {
  categoryId?: string;
}

export interface ProductSalesRow {
  productId: string;
  code: string;
  name: string;
  categoryId: string;
  categoryName: string;
  sold: number;
  returned: number;
  netQuantity: number;
  gross: Money;
  discount: Money;
  refunded: Money;
  /** After discounts, less refunds. */
  net: Money;
  /** Basis points of the period's net. */
  shareBps: number;
}

export interface ProductSalesReport {
  from: string;
  to: string;
  rows: ProductSalesRow[];
  totals: { sold: number; returned: number; gross: Money; discount: Money; net: Money };
  categories: { id: string; name: string }[];
}

export interface LocationSalesRow {
  locationId: LocationId;
  name: string;
  /** POS or WHOLESALE (a van's invoices, not POS sales). */
  channel: 'POS' | 'WHOLESALE';
  net: Money;
  orders: number;
  averageOrder: Money;
  discounts: Money;
  refunds: Money;
  shareBps: number;
  byDay: { date: string; net: Money }[];
}

export interface LocationSalesReport {
  from: string;
  to: string;
  rows: LocationSalesRow[];
  /** POS only. */
  totals: { net: Money; orders: number };
}

export interface StockReportParams extends ReportParams {
  categoryId?: string;
  status?: StockStatus;
}

export interface StockReportRow {
  productId: string;
  code: string;
  name: string;
  unit: StockUnit;
  categoryId: string;
  locationId: LocationId;
  opening: number;
  received: number;
  produced: number;
  returned: number;
  sold: number;
  transferredOut: number;
  wasted: number;
  staffMeals: number;
  usedInProduction: number;
  adjusted: number;
  closing: number;
  onHandNow: number;
  minStock: number;
  status: StockStatus;
}

export interface StockReport {
  from: string;
  to: string;
  rows: StockReportRow[];
  totals: { wasted: number; staffMeals: number; received: number; sold: number };
  categories: { id: string; name: string }[];
}

export interface VoidReportApproval {
  approvedBy: string;
  reason: string;
  cashier: string;
}

export interface VoidsReport {
  from: string;
  to: string;
  discounts: ({
    id: string;
    orderId: string;
    orderNumber: string;
    locationId: LocationId;
    at: IsoDateTime;
    kind: 'DISCOUNT' | 'PRICE';
    label: string;
    amount: Money;
  } & VoidReportApproval)[];
  cancelled: ({
    orderId: string;
    orderNumber: string;
    locationId: LocationId;
    at: IsoDateTime;
    amount: Money;
  } & VoidReportApproval)[];
  voided: ({
    orderId: string;
    orderNumber: string;
    locationId: LocationId;
    at: IsoDateTime;
    amount: Money;
  } & VoidReportApproval)[];
  removedItems: ({
    id: string;
    orderId: string;
    label: string;
    locationId: string | null;
    at: IsoDateTime;
  } & VoidReportApproval)[];
  refunds: ({
    id: string;
    number: string;
    orderId: string;
    orderNumber: string;
    locationId: LocationId;
    at: IsoDateTime;
    items: string;
    amount: Money;
  } & VoidReportApproval)[];
  byReason: { reason: string; count: number; amount: Money }[];
  byApprover: { name: string; count: number; amount: Money }[];
  totals: {
    discounts: Money;
    cancelled: Money;
    voided: Money;
    refunds: Money;
    removedItems: number;
  };
}
