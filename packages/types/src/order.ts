import type { AuditEvent, SensitiveActionContext } from './audit';
import type { NameTranslations, TaxMode } from './catalog';
import type { IsoDateTime, LocationId, Money } from './common';
import type { SaleAdjustment } from './pos';

/** Totals as the server computed them (same shape as `computeTotals`). */
export interface OrderTotals {
  subtotal: Money;
  lineDiscounts: Money;
  billDiscounts: { id: string; label: string; amount: Money }[];
  discountTotal: Money;
  serviceCharge: Money;
  serviceChargeBps: number;
  serviceOverridden: boolean;
  charges: { id: string; code: string; label: string; amount: Money }[];
  tax: Money;
  total: Money;
  itemCount: number;
  lines: {
    productId: string | undefined;
    unitPrice: Money;
    gross: Money;
    discount: Money;
    net: Money;
  }[];
}

export type OrderStatus = 'OPEN' | 'HELD' | 'PAID' | 'CANCELLED' | 'VOIDED';
/** REST-002/005/006 order types (RETAIL = counter sale). */
export type OrderType = 'RETAIL' | 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
/** REQ-495…518 delivery lifecycle. */
export type DeliveryStatus =
  'NEW' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';

export interface OrderDelivery {
  address: string;
  phone: string;
  instructions?: string;
  status: DeliveryStatus;
  /** DEL-003 rider (an employee who can deliver). */
  riderId?: string;
  riderName?: string;
  assignedAt?: IsoDateTime;
  /** DEL-002 timeline: every status change, oldest first. */
  history?: { status: DeliveryStatus; at: IsoDateTime; by: string }[];
}
export type PaymentMethod = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'CREDIT';

export interface OrderLine {
  id: string;
  productId: string;
  code: string;
  name: string;
  nameTranslations: NameTranslations;
  /** Currently on the order (after cancellations). */
  quantity: number;
  /** Cancelled on the saved order with PIN + reason (never deleted). */
  cancelledQuantity: number;
  /** Returned after payment (POS-011). */
  returnedQuantity: number;
  /** Already sent to the kitchen (KOT); later additions go in a new KOT. */
  sentQuantity: number;
  /** Special instructions for the kitchen, e.g. "No onion" (REQ-340…352). */
  note?: string;
  /** Location price at the time of sale (before POS price changes/discounts). */
  unitPrice: Money;
  taxMode: TaxMode;
  serviceCharge: boolean;
}

export interface Payment {
  id: string;
  method: PaymentMethod;
  amount: Money;
  /** Cash handed over (CASH only). */
  tendered?: Money;
  change?: Money;
  /** Card auth code / bank transfer reference. */
  reference?: string;
  status: 'CAPTURED' | 'REFUNDED';
  /** Refund records point at what they refund (returns, voids). */
  kind: 'SALE' | 'REFUND';
  createdAt: IsoDateTime;
  createdBy: string;
}

export interface OrderApproval {
  reason: NonNullable<AuditEvent['reason']>;
  approvedBy: { id: string; fullName: string };
  at: IsoDateTime;
}

export interface OrderReturn {
  id: string;
  number: string;
  lines: { lineId: string; productId: string; name: string; quantity: number; amount: Money }[];
  amount: Money;
  refundMethod: PaymentMethod;
  approval: OrderApproval;
  createdAt: IsoDateTime;
  createdBy: string;
}

/** A saved sale (Hold/Pay onward). Drafts live on the device until then. */
export interface Order {
  id: string;
  number: string;
  type: OrderType;
  status: OrderStatus;
  /** Dine-in table (REST-001). */
  table: { id: string; name: string } | null;
  delivery: OrderDelivery | null;
  /** Bill printed for the table (REST-007). */
  billPrintedAt?: IsoDateTime;
  locationId: LocationId;
  deviceId: string | null;
  /** Device that has it open (resumed); prevents two terminals editing one order. */
  openedByDeviceId: string | null;
  customer: { id: string; name: string; phone: string | null } | null;
  lines: OrderLine[];
  /** Approved discounts/charges/price changes attached to this order. */
  adjustments: SaleAdjustment[];
  totals: OrderTotals;
  payments: Payment[];
  returns: OrderReturn[];
  holdLabel?: string;
  createdBy: string;
  createdAt: IsoDateTime;
  heldAt?: IsoDateTime;
  paidAt?: IsoDateTime;
  /** Cancel (unpaid) or void (paid) — who approved and why. */
  cancellation?: OrderApproval;
}

export interface OrderListParams {
  status?: OrderStatus;
  /** Order number or customer name/phone. */
  search?: string;
  /** ISO; e.g. start of today. */
  from?: string;
  page?: number;
  pageSize?: number;
  /** DEL-001 delivery orders only. */
  type?: OrderType;
  deliveryStatus?: DeliveryStatus;
}

export interface OrderLineInput {
  productId: string;
  quantity: number;
  note?: string;
}

export interface OrderTypeInput {
  type?: OrderType;
  tableId?: string | null;
  delivery?: { address: string; phone: string; instructions?: string } | null;
}

export interface CreateOrderRequest extends OrderTypeInput {
  lines: OrderLineInput[];
  customerId?: string | null;
  adjustmentIds: string[];
  status: 'OPEN' | 'HELD';
  holdLabel?: string;
}

/** Sync a resumed order back (Hold again / before Pay). Reductions must already be cancelled. */
export interface UpdateOrderLinesRequest extends OrderTypeInput {
  lines: OrderLineInput[];
  customerId?: string | null;
  adjustmentIds: string[];
  status?: 'OPEN' | 'HELD';
  holdLabel?: string;
}

export interface PayOrderRequest {
  method: PaymentMethod;
  /** CASH: cash handed over. */
  tendered?: Money;
  /** BANK_TRANSFER reference (CARD gets a simulated auth code). */
  reference?: string;
}

/** What happens to food that was already sent to the kitchen (SCN-004, REQ-423…459). */
export type PreparedDisposition = 'NOT_PREPARED' | 'RESALE' | 'WASTAGE' | 'STAFF_MEAL';

export interface CancelItemRequest {
  /** How many to take off the saved line. */
  quantity: number;
  verification: SensitiveActionContext;
  /** Required when the cancelled units were already sent to the kitchen. */
  disposition?: PreparedDisposition;
}

export interface OrderApprovalRequest {
  verification: SensitiveActionContext;
}

/** POS-012 cancel: like cancelling items, food the kitchen already has needs a disposition. */
export interface CancelOrderRequest extends OrderApprovalRequest {
  disposition?: PreparedDisposition;
}

export interface CreateReturnRequest {
  lines: { lineId: string; quantity: number }[];
  /** ORIGINAL = back to how it was paid (credit sale → reduces the customer balance). */
  refundMethod: 'CASH' | 'ORIGINAL';
  /** Returned goods go back into stock (default). false = recorded as wastage. */
  restock?: boolean;
  verification: SensitiveActionContext;
}

/** POS-009 receipt view model — everything the printer or preview needs, already resolved. */
export interface Receipt {
  /** BILL = pro-forma bill for the table before payment (REST-007). */
  copy: 'ORIGINAL' | 'REPRINT' | 'BILL';
  orderType: OrderType;
  table: string | null;
  kind: 'SALE' | 'RETURN';
  business: { name: string; logoText: string };
  location: { name: string; address: string };
  number: string;
  /** For a return receipt: the sale it refers to. */
  originalNumber?: string;
  at: IsoDateTime;
  cashier: string;
  device: string | null;
  customer: { name: string; phone: string | null } | null;
  lines: { name: string; quantity: number; unitPrice: Money; total: Money; note?: string }[];
  /**
   * `label` is the resolved English text (fallback); `code` (+ `rateBps`) lets the client print
   * fixed rows in the cashier's language. Discounts and other charges carry their own label.
   */
  rows: {
    label: string;
    amount: Money;
    kind: 'default' | 'discount' | 'charge';
    code?: 'SUBTOTAL' | 'ITEM_DISCOUNTS' | 'SERVICE' | 'TAX';
    rateBps?: number;
  }[];
  total: Money;
  /** `method` (+ `tendered` / `refund`) lets the client translate the label. */
  payments: {
    label: string;
    amount: Money;
    reference?: string;
    method?: PaymentMethod;
    tendered?: boolean;
    refund?: boolean;
  }[];
  change?: Money;
  status: OrderStatus;
  footer: string;
}

/** REST-001 table with its live state (derived from open orders). */
export interface RestaurantTable {
  id: string;
  locationId: LocationId;
  name: string;
  area: string;
  seats: number;
  status: 'FREE' | 'OCCUPIED' | 'BILLING';
  order: {
    id: string;
    number: string;
    total: Money;
    itemCount: number;
    openedAt: IsoDateTime;
    createdBy: string;
    /** Items waiting to be sent to the kitchen. */
    unsent: number;
  } | null;
}

export interface TransferTableRequest {
  toTableId: string;
  verification: SensitiveActionContext;
}

export type KotStatus = 'NEW' | 'PREPARING' | 'READY' | 'COMPLETED';

/** KOT-001…004 kitchen order ticket: one per kitchen station per round. */
export interface Kot {
  id: string;
  number: string;
  /** SEND = new items; CANCEL = stop/cancel items already sent. */
  kind: 'SEND' | 'CANCEL';
  orderId: string;
  orderNumber: string;
  orderType: OrderType;
  table: string | null;
  locationId: LocationId;
  stationId: string | null;
  stationName: string;
  status: KotStatus;
  items: {
    lineId: string;
    productId: string;
    name: string;
    quantity: number;
    note?: string;
    disposition?: PreparedDisposition;
  }[];
  createdBy: string;
  createdAt: IsoDateTime;
  startedAt?: IsoDateTime;
  readyAt?: IsoDateTime;
  completedAt?: IsoDateTime;
}

export interface KotListParams {
  status?: KotStatus;
  /** Include completed tickets (default: only active). */
  includeCompleted?: boolean;
  stationId?: string;
}

export interface SendToKitchenResponse {
  order: Order;
  kots: Kot[];
}

export interface DeliveryStatusRequest {
  status: DeliveryStatus;
  /** DEL-004 collect on delivery (the order must be paid to be Delivered). */
  payment?: { method: 'CASH' | 'CARD'; tendered?: Money };
}

/** DEL-003 */
export interface DeliveryAssignRequest {
  riderId: string;
}

/** An employee who can deliver, with what they're carrying now. */
export interface DeliveryRider {
  id: string;
  code: string;
  fullName: string;
  phone: string | null;
  /** Assigned and not yet delivered. */
  active: number;
  outNow: number;
}

export interface DeliveryListParams {
  /** YYYY-MM-DD (local); default today. */
  date?: string;
  status?: DeliveryStatus;
  riderId?: string;
}
