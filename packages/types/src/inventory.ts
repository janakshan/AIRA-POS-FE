import type { IsoDateTime, LocationId, Paginated } from './common';

/** INV-001…006 basic inventory on a stock ledger (movements, never a mutable quantity). */

export type StockUnit = 'pcs' | 'portion' | 'pack';

export type StockMovementType =
  | 'OPENING'
  | 'SALE'
  | 'RETURN'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'WASTAGE'
  | 'STAFF_MEAL'
  | 'ADJUSTMENT'
  // Reserved for purchasing / bakery production (P5).
  | 'PURCHASE'
  | 'PRODUCTION_CONSUMPTION'
  | 'PRODUCTION_OUTPUT';

export type StockReferenceKind =
  | 'OPENING'
  | 'ORDER'
  | 'RETURN'
  | 'VOID'
  | 'ADJUSTMENT'
  | 'TRANSFER'
  | 'KOT_CANCEL'
  | 'GOODS_RECEIPT'
  | 'PRODUCTION_BATCH'
  | 'WHOLESALE_INVOICE'
  | 'WHOLESALE_RETURN'
  | 'STAFF_MEAL';

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  productCode: string;
  unit: StockUnit;
  locationId: LocationId;
  type: StockMovementType;
  /** + into stock, − out of stock. Whole units. */
  quantity: number;
  /** On hand at this location right after the movement. */
  balanceAfter: number;
  reference: { kind: StockReferenceKind; id: string | null; number: string | null };
  reason?: { code: string; label: string; comment?: string };
  /** Employee whose PIN approved it (adjustments). */
  approvedBy?: string;
  note?: string;
  createdBy: string;
  at: IsoDateTime;
}

export type StockStatus = 'OK' | 'LOW' | 'OUT';

/** One item at one location, derived from its movements. */
export interface StockLevel {
  productId: string;
  code: string;
  name: string;
  unit: StockUnit;
  categoryId: string;
  locationId: LocationId;
  onHand: number;
  /** 0 = no low-stock alert. */
  minStock: number;
  status: StockStatus;
  lastMovementAt: IsoDateTime | null;
}

export interface InventoryListParams {
  /** A location id, or 'all' for every location the user can access. Default: current. */
  locationId?: string;
  search?: string;
  status?: 'LOW' | 'OUT';
  categoryId?: string;
  page?: number;
  pageSize?: number;
}

export interface InventoryListResponse extends Paginated<StockLevel> {
  summary: { tracked: number; low: number; out: number };
}

/** INV-002 */
export interface InventoryItemDetail {
  productId: string;
  code: string;
  name: string;
  unit: StockUnit;
  categoryId: string;
  levels: StockLevel[];
  recent: StockMovement[];
}

export interface StockMovementListParams {
  productId?: string;
  locationId?: string;
  type?: StockMovementType;
  /** ISO lower bound. */
  from?: string;
  page?: number;
  pageSize?: number;
}

export type StockAdjustmentKind = 'COUNT' | 'ADD' | 'REMOVE' | 'WASTAGE' | 'STAFF_MEAL';

export interface StockAdjustment {
  id: string;
  number: string;
  productId: string;
  productName: string;
  unit: StockUnit;
  locationId: LocationId;
  kind: StockAdjustmentKind;
  /** What was entered: the counted quantity for COUNT, else the units added/removed. */
  quantity: number;
  before: number;
  after: number;
  movementId: string;
  reason: { code: string; label: string; comment?: string };
  approvedBy: string;
  createdBy: string;
  at: IsoDateTime;
}

export interface StockAdjustmentListParams {
  locationId?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateStockAdjustmentRequest {
  locationId: string;
  productId: string;
  kind: StockAdjustmentKind;
  quantity: number;
  note?: string;
  verification: { verificationId: string; reasonCode: string; reasonComment?: string };
}

export interface SetMinStockRequest {
  minStock: number;
}

export type StockTransferStatus = 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';

export interface StockTransferLine {
  productId: string;
  code: string;
  name: string;
  unit: StockUnit;
  quantity: number;
  receivedQuantity?: number;
}

/** INV-005 Dispatch → Receive. Stock leaves at dispatch and arrives at receipt. */
export interface StockTransfer {
  id: string;
  number: string;
  fromLocationId: LocationId;
  toLocationId: LocationId;
  status: StockTransferStatus;
  lines: StockTransferLine[];
  note?: string;
  dispatchedBy: string;
  dispatchedAt: IsoDateTime;
  receivedBy?: string;
  receivedAt?: IsoDateTime;
  cancelledBy?: string;
  cancelledAt?: IsoDateTime;
}

export interface StockTransferListParams {
  /** Relative to the current location. */
  direction?: 'in' | 'out';
  status?: StockTransferStatus;
  page?: number;
  pageSize?: number;
}

export interface CreateStockTransferRequest {
  fromLocationId: string;
  toLocationId: string;
  lines: { productId: string; quantity: number }[];
  note?: string;
}

export interface ReceiveStockTransferRequest {
  lines: { productId: string; receivedQuantity: number }[];
}

/** Carried on POS location products (null = not tracked here). */
export interface LocationStock {
  onHand: number;
  minStock: number;
  unit: StockUnit;
  status: StockStatus;
  /** REC: made to order from a recipe — `onHand` is how many can be made (incl. prepared). */
  madeToOrder?: boolean;
  /** REC-005 prepared units ready to resell at this location. */
  prepared?: number;
  /** The ingredient that runs out first. */
  limitedBy?: string;
}
