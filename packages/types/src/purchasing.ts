import type { IsoDateTime, LocationId, Money, Paginated } from './common';
import type { StockUnit } from './inventory';

/** PUR-001…004 purchasing: supplier → purchase order → goods receipt (posts PURCHASE stock). */

export interface Supplier {
  id: string;
  /** SUP-001 */
  code: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  /** Days of credit the supplier gives (0 = cash on delivery). */
  paymentTermsDays: number;
  note?: string;
  isActive: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  /** Derived: ORDERED or PARTIALLY_RECEIVED purchase orders. */
  openOrders: number;
  lastOrderAt: IsoDateTime | null;
  /** Derived: value of everything received from this supplier. */
  totalReceived: Money;
}

export interface SupplierListParams {
  search?: string;
  /** Default: all. */
  active?: boolean;
  page?: number;
  pageSize?: number;
}

export interface SupplierRequest {
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  paymentTermsDays: number;
  note?: string;
}

export type PurchaseOrderStatus =
  'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';

export interface PurchaseOrderLine {
  productId: string;
  productName: string;
  productCode: string;
  unit: StockUnit;
  quantity: number;
  receivedQuantity: number;
  /** Agreed cost per unit (products carry no cost price). */
  unitCost: Money;
}

export interface PurchaseOrder {
  id: string;
  /** PO-000001 */
  number: string;
  supplierId: string;
  supplierName: string;
  /** Deliver to. */
  locationId: LocationId;
  status: PurchaseOrderStatus;
  /** YYYY-MM-DD */
  expectedDate?: string;
  lines: PurchaseOrderLine[];
  total: Money;
  note?: string;
  createdBy: string;
  createdAt: IsoDateTime;
  orderedAt?: IsoDateTime;
  cancelledBy?: string;
  cancelledAt?: IsoDateTime;
  cancelReason?: string;
  receiptIds: string[];
}

export interface PurchaseOrderListParams {
  status?: PurchaseOrderStatus;
  /** Only ORDERED + PARTIALLY_RECEIVED (awaiting delivery). */
  open?: boolean;
  supplierId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PurchaseOrderRequest {
  supplierId: string;
  locationId: string;
  expectedDate?: string;
  note?: string;
  lines: { productId: string; quantity: number; unitCost: number }[];
  /** Create/save and place in one step. */
  place?: boolean;
}

export interface CancelPurchaseOrderRequest {
  reason: string;
}

export interface GoodsReceiptLine {
  productId: string;
  productName: string;
  productCode: string;
  unit: StockUnit;
  orderedQuantity: number;
  receivedQuantity: number;
  unitCost: Money;
  /** On hand at the location right after this receipt. */
  balanceAfter: number;
}

/** GRN: one delivery against a purchase order. */
export interface GoodsReceipt {
  id: string;
  /** GRN-000001 */
  number: string;
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  supplierId: string;
  supplierName: string;
  locationId: LocationId;
  lines: GoodsReceiptLine[];
  total: Money;
  supplierInvoiceRef?: string;
  note?: string;
  receivedBy: string;
  receivedAt: IsoDateTime;
}

export interface GoodsReceiptListParams {
  supplierId?: string;
  purchaseOrderId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface ReceiveGoodsRequest {
  lines: { productId: string; receivedQuantity: number }[];
  supplierInvoiceRef?: string;
  note?: string;
}

export type SupplierListResponse = Paginated<Supplier>;
