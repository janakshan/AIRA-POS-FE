import type { Id, IsoDateTime, LocationId, Money, Paginated, TenantId } from './common';
import type { OrderStatus } from './order';

export type CustomerId = Id<'Customer'>;

export type CustomerType = 'RETAIL' | 'REGULAR' | 'CORPORATE';

export interface CustomerPhone {
  /** E.164, e.g. +94771234567. */
  number: string;
  label?: string;
  primary: boolean;
}

/** CUS-001…005 / POS-003 (REQ-399…419). */
export interface Customer {
  id: CustomerId;
  tenantId: TenantId;
  name: string;
  type: CustomerType;
  phones: CustomerPhone[];
  address?: string;
  deliveryAddress?: string;
  notes?: string;
  /** Unpaid credit sales. */
  outstanding: Money;
  lastOrderAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type CustomerSort = 'name' | 'lastOrder' | 'outstanding';

export interface CustomerListParams {
  page?: number;
  pageSize?: number;
  /** Partial name or phone digits. */
  search?: string;
  /** Exact lookup; any common format is normalized to E.164. */
  phone?: string;
  type?: CustomerType;
  /** Only customers with an outstanding balance. */
  owes?: boolean;
  sort?: CustomerSort;
}

/** CUS-001 list page plus tenant-wide balance totals (for the current filters' tenant). */
export interface CustomerListResponse extends Paginated<Customer> {
  summary: { totalOutstanding: Money; owingCount: number };
}

export interface CustomerPhoneInput {
  number: string;
  label?: string;
  primary: boolean;
}

/**
 * POS-003 quick create sends `phone`; CUS-002 sends the full record with `phones`
 * (exactly one primary).
 */
export interface CreateCustomerRequest {
  name: string;
  phone?: string;
  phones?: CustomerPhoneInput[];
  type?: CustomerType;
  address?: string;
  deliveryAddress?: string;
  notes?: string;
}

export type UpdateCustomerRequest = Partial<CreateCustomerRequest>;

/** CUS-003 detail: the record plus what the customer has bought (all locations). */
export interface CustomerDetail extends Customer {
  stats: {
    /** Paid orders (voided excluded). */
    orderCount: number;
    /** Paid totals minus returns. */
    totalSpent: Money;
    averageOrder: Money;
    lastOrderAt: IsoDateTime | null;
  };
}

export interface CustomerOrderListParams {
  page?: number;
  pageSize?: number;
  status?: OrderStatus;
}

export type CustomerLedgerKind = 'OPENING' | 'CREDIT_SALE' | 'RETURN' | 'VOID' | 'PAYMENT';

/** CUS-005 statement line: + adds to what they owe, − reduces it. */
export interface CustomerLedgerEntry {
  id: string;
  at: IsoDateTime;
  kind: CustomerLedgerKind;
  /** Invoice, return or payment number. */
  reference: string;
  orderId: string | null;
  locationId: LocationId | null;
  amount: Money;
  /** Balance after this entry. */
  balance: Money;
  by: string | null;
}

export type CustomerPaymentMethod = 'CASH' | 'CARD' | 'BANK_TRANSFER';

/** Money received against the customer's account (settling credit sales). */
export interface CustomerPayment {
  id: string;
  customerId: CustomerId;
  number: string;
  amount: Money;
  method: CustomerPaymentMethod;
  reference?: string;
  note?: string;
  locationId: LocationId | null;
  receivedBy: string;
  at: IsoDateTime;
}

export interface ReceiveCustomerPaymentRequest {
  amount: Money;
  method: CustomerPaymentMethod;
  reference?: string;
  note?: string;
}

export interface ReceiveCustomerPaymentResponse {
  payment: CustomerPayment;
  customer: Customer;
}
