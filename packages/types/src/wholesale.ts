import type { SensitiveActionContext } from './audit';
import type { IsoDateTime, LocationId, Money } from './common';
import type { CustomerPhone } from './customer';
import type { StockMovement, StockUnit } from './inventory';

/**
 * WHO-001…006 wholesale / field sales (FLOW-WHO-001, SCN-008). PROTOTYPE SHAPES — the source
 * docs give the intent only (§2.4, §25, §26); fields, statuses and rules are assumptions
 * (A-268…). Shops are separate from POS customers; the van is a stock location.
 *
 * Shop balance = opening + Σ invoice credit − Σ collections − Σ return credit.
 */

export interface WholesaleRoute {
  id: string;
  /** RT-A */
  code: string;
  name: string;
  /** 0 = Sunday … 6 = Saturday. */
  days: number[];
  /** Where the route's stock comes from (a VAN location). */
  vanLocationId: LocationId;
  repName: string;
  shopCount: number;
}

export interface WholesaleShop {
  id: string;
  /** SHP-001 */
  code: string;
  name: string;
  ownerName?: string;
  phones: CustomerPhone[];
  address?: string;
  area?: string;
  routeId: string | null;
  /** Visit order on the route. */
  stopOrder: number;
  creditLimit: Money;
  /** Days an invoice may stay unpaid before it's overdue. */
  paymentTermsDays: number;
  notes?: string;
  isActive: boolean;
  createdAt: IsoDateTime;
  /** Derived. */
  outstanding: Money;
  /** Unpaid invoice credit older than the payment terms. */
  overdue: Money;
  overLimit: boolean;
  lastVisitAt: IsoDateTime | null;
}

export interface WholesaleShopListParams {
  search?: string;
  routeId?: string;
  /** OWES = outstanding > 0; OVER_LIMIT; OVERDUE. */
  balance?: 'OWES' | 'OVER_LIMIT' | 'OVERDUE';
}

export interface WholesaleShopListResponse {
  items: WholesaleShop[];
  summary: { shops: number; outstanding: Money; overdue: Money; overLimit: number };
}

export interface WholesaleShopRequest {
  name: string;
  ownerName?: string;
  phones: { number: string; label?: string; primary: boolean }[];
  address?: string;
  area?: string;
  routeId?: string | null;
  /** Minor units. */
  creditLimit: number;
  paymentTermsDays: number;
  notes?: string;
  isActive?: boolean;
}

/** Tenant wholesale price (VAT inclusive) and stock in the van. */
export interface WholesaleProduct {
  productId: string;
  code: string;
  name: string;
  unit: StockUnit;
  price: Money;
  /** Retail price, for reference. */
  retailPrice: Money;
  /** At the requested van. */
  onHand: number;
}

export type WholesalePaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CHEQUE';

export interface WholesaleInvoiceLine {
  productId: string;
  code: string;
  name: string;
  unit: StockUnit;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
  /** Already credited back by returns. */
  returnedQuantity: number;
}

export type WholesaleInvoiceStatus = 'OPEN' | 'PAID';

/** WHO-003: a sale to a shop from the van. Prices include VAT. */
export interface WholesaleInvoice {
  id: string;
  /** WIN-000001 */
  number: string;
  shopId: string;
  shopName: string;
  shopPhone: string | null;
  routeId: string | null;
  /** The van the goods came from. */
  locationId: LocationId;
  lines: WholesaleInvoiceLine[];
  total: Money;
  /** VAT contained in the total. */
  tax: Money;
  taxLabel: string;
  taxRateBps: number;
  /** Taken at the shop when the invoice was made. */
  paidNow: { method: WholesalePaymentMethod; amount: Money } | null;
  /** total − paid now: added to the shop's balance. */
  credit: Money;
  /** Still unpaid (after collections and return credits, FIFO). */
  balance: Money;
  status: WholesaleInvoiceStatus;
  /** Due for payment (terms from the invoice date). */
  dueDate: string;
  /** The sale took the shop over its credit limit (allowed, flagged). */
  creditWarning: boolean;
  /** Shop balance before and after this invoice. */
  balanceBefore: Money;
  balanceAfter: Money;
  shares: { channel: 'SHARE' | 'WHATSAPP' | 'COPY'; at: IsoDateTime; by: string }[];
  prints: { at: IsoDateTime; by: string }[];
  note?: string;
  createdBy: string;
  at: IsoDateTime;
}

export interface WholesaleInvoiceListParams {
  shopId?: string;
  routeId?: string;
  /** YYYY-MM-DD (local). */
  date?: string;
  status?: WholesaleInvoiceStatus;
}

export interface WholesaleInvoiceRequest {
  shopId: string;
  /** The van; default: the shop's route van. */
  locationId?: string;
  lines: { productId: string; quantity: number }[];
  /** Minor units taken now (0 = all on credit). */
  paidNow: number;
  method?: WholesalePaymentMethod;
  note?: string;
}

export interface ShareInvoiceRequest {
  channel: 'SHARE' | 'WHATSAPP' | 'COPY';
}

/** WHO-004 money received from a shop, applied to its oldest open invoices. */
export interface WholesaleCollection {
  id: string;
  /** COL-000001 */
  number: string;
  shopId: string;
  shopName: string;
  routeId: string | null;
  amount: Money;
  method: WholesalePaymentMethod;
  reference?: string;
  allocations: { invoiceId: string; invoiceNumber: string; amount: Money }[];
  balanceAfter: Money;
  note?: string;
  receivedBy: string;
  at: IsoDateTime;
}

export interface WholesaleCollectionListParams {
  shopId?: string;
  routeId?: string;
  date?: string;
  /** Days back from today (0 = today). */
  days?: number;
}

export interface WholesaleCollectionRequest {
  shopId: string;
  /** Minor units. */
  amount: number;
  method: WholesalePaymentMethod;
  reference?: string;
  note?: string;
}

export type ReturnCondition = 'GOOD' | 'DAMAGED' | 'EXPIRED' | 'WASTAGE';

export interface WholesaleReturnLine {
  productId: string;
  code: string;
  name: string;
  unit: StockUnit;
  quantity: number;
  condition: ReturnCondition;
  unitCredit: Money;
  lineCredit: Money;
}

/** WHO-005: goods a shop gives back (§26), credited to its balance. */
export interface WholesaleReturn {
  id: string;
  /** WRN-000001 */
  number: string;
  shopId: string;
  shopName: string;
  routeId: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  /** The van the goods went back into. */
  locationId: LocationId;
  lines: WholesaleReturnLine[];
  credit: Money;
  allocations: { invoiceId: string; invoiceNumber: string; amount: Money }[];
  balanceAfter: Money;
  reason: { code: string; label: string; comment?: string };
  approvedBy: string;
  recordedBy: string;
  at: IsoDateTime;
}

export interface WholesaleReturnDetail extends WholesaleReturn {
  movements: StockMovement[];
}

export interface WholesaleReturnListParams {
  shopId?: string;
  routeId?: string;
  days?: number;
}

export interface WholesaleReturnRequest {
  shopId: string;
  invoiceId?: string;
  lines: { productId: string; quantity: number; condition: ReturnCondition }[];
  verification: SensitiveActionContext;
}

export type ShopLedgerKind = 'OPENING' | 'INVOICE' | 'COLLECTION' | 'RETURN';

/** WHO-002 statement row (credit part of an invoice only; cash paid at the shop nets out). */
export interface ShopLedgerEntry {
  id: string;
  kind: ShopLedgerKind;
  number: string | null;
  refId: string | null;
  description: string;
  /** + owed, − paid/credited. */
  amount: Money;
  balance: Money;
  at: IsoDateTime;
}

/** WHO-006 one route on one day. */
export interface RouteOverview {
  route: WholesaleRoute;
  /** YYYY-MM-DD */
  date: string;
  /** The route runs on this weekday. */
  scheduled: boolean;
  stops: {
    shop: WholesaleShop;
    visited: boolean;
    sales: Money;
    collected: Money;
    returns: Money;
    invoiceIds: string[];
  }[];
  totals: {
    sales: Money;
    cashAtSale: Money;
    collected: Money;
    creditGiven: Money;
    returns: Money;
    visited: number;
  };
  van: {
    locationId: LocationId;
    name: string;
    items: { productId: string; name: string; unit: StockUnit; onHand: number }[];
  };
}
