import type { SensitiveActionContext } from './audit';
import type { IsoDateTime, LocationId } from './common';
import type { StockMovement, StockStatus, StockUnit } from './inventory';

/**
 * BAK-001…005 bakery production (FLOW-BAK-001). PROTOTYPE SHAPES — the source docs name only
 * ProductionPlan / ProductionBatch; fields, statuses and formulas are assumptions (A-260…).
 *
 * Plan → Start batch (PRODUCTION_CONSUMPTION) → Record output (PRODUCTION_OUTPUT, rejects as
 * WASTAGE) → finished goods on the ledger at the production location.
 */

export interface ProductionFormulaLine {
  ingredientId: string;
  /** Whole units of the raw material per batch run. */
  quantity: number;
}

/** What one batch run of a bakery product uses and yields (seeded; editing comes later). */
export interface ProductionFormula {
  productId: string;
  productCode: string;
  productName: string;
  unit: StockUnit;
  /** Finished units one run makes. */
  yieldQuantity: number;
  lines: (ProductionFormulaLine & {
    code: string;
    name: string;
    unit: StockUnit;
    /** At the requested location. */
    onHand: number;
  })[];
}

export type ProductionPlanStatus =
  'DRAFT' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface ProductionPlanLine {
  productId: string;
  productName: string;
  productCode: string;
  unit: StockUnit;
  /** What the day needs. */
  plannedQuantity: number;
  /** ceil(planned / yield). */
  runs: number;
  /** runs × yield. */
  expectedQuantity: number;
  /** Set when the plan is confirmed. */
  batchId?: string;
}

/** BAK-002: one location's production for one day. */
export interface ProductionPlan {
  id: string;
  /** PLN-000001 */
  number: string;
  locationId: LocationId;
  /** YYYY-MM-DD */
  planDate: string;
  status: ProductionPlanStatus;
  lines: ProductionPlanLine[];
  note?: string;
  createdBy: string;
  createdAt: IsoDateTime;
  confirmedBy?: string;
  confirmedAt?: IsoDateTime;
  cancelledBy?: string;
  cancelledAt?: IsoDateTime;
  cancelReason?: string;
  /** Derived from the batches. */
  progress: { batches: number; completed: number; produced: number; rejected: number };
}

export interface ProductionPlanListParams {
  /** A location id or 'all'. Default: current. */
  locationId?: string;
  status?: ProductionPlanStatus;
  /** YYYY-MM-DD */
  from?: string;
  to?: string;
}

export interface ProductionPlanRequest {
  locationId: string;
  planDate: string;
  note?: string;
  lines: { productId: string; plannedQuantity: number }[];
}

export interface CancelProductionRequest {
  reason: string;
}

export type ProductionBatchStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface BatchConsumptionLine {
  ingredientId: string;
  code: string;
  name: string;
  unit: StockUnit;
  /** Formula × runs. */
  plannedQuantity: number;
  /** What was actually used (set when the batch starts). */
  actualQuantity: number | null;
  /** On hand at the batch location now. */
  onHand: number;
}

/** BAK-003: one production run of one product. */
export interface ProductionBatch {
  id: string;
  /** BAT-000001 */
  number: string;
  planId: string;
  planNumber: string;
  planDate: string;
  productId: string;
  productName: string;
  productCode: string;
  unit: StockUnit;
  locationId: LocationId;
  status: ProductionBatchStatus;
  runs: number;
  expectedQuantity: number;
  consumption: BatchConsumptionLine[];
  /** Went into finished-goods stock. */
  goodQuantity: number | null;
  /** Came out of the oven but not fit to sell (WASTAGE). */
  rejectedQuantity: number | null;
  rejectReason?: { code: string; label: string; comment?: string };
  startedAt?: IsoDateTime;
  startedBy?: string;
  completedAt?: IsoDateTime;
  completedBy?: string;
  cancelledAt?: IsoDateTime;
  cancelledBy?: string;
  cancelReason?: string;
  note?: string;
}

export interface ProductionBatchDetail extends ProductionBatch {
  /** Every ledger movement this batch posted. */
  movements: StockMovement[];
}

export interface ProductionBatchListParams {
  locationId?: string;
  status?: ProductionBatchStatus;
  planId?: string;
  /** YYYY-MM-DD plan date. */
  date?: string;
}

export interface StartBatchRequest {
  /** Actual raw materials used; omitted lines use the formula. */
  consumption?: { ingredientId: string; quantity: number }[];
  note?: string;
}

export interface CompleteBatchRequest {
  goodQuantity: number;
  rejectedQuantity: number;
  /** Required when anything was rejected (a production.wastage reason). */
  rejectReasonCode?: string;
  rejectComment?: string;
}

/** BAK-004: finished bakery goods at a location. */
export interface FinishedGoodsItem {
  productId: string;
  code: string;
  name: string;
  unit: StockUnit;
  locationId: LocationId;
  onHand: number;
  minStock: number;
  status: StockStatus;
  producedToday: number;
  wastedToday: number;
  lastBatch: { id: string; number: string; completedAt: IsoDateTime; goodQuantity: number } | null;
}

export type WastageSource = 'BATCH' | 'FINISHED_GOODS';

/**
 * BAK-005: every WASTAGE movement of a bakery product — batch rejects and finished goods
 * written off (here or through INV-004). Read from the ledger, so it always reconciles.
 */
export interface WastageEntry {
  /** The stock movement. */
  id: string;
  /** BAT-… for rejects, ADJ-… for write-offs. */
  number: string;
  source: WastageSource;
  productId: string;
  productName: string;
  productCode: string;
  unit: StockUnit;
  locationId: LocationId;
  quantity: number;
  reason: { code: string; label: string; comment?: string };
  batchId?: string;
  /** Employee whose PIN approved a finished-goods write-off. */
  approvedBy?: string;
  recordedBy: string;
  at: IsoDateTime;
}

export interface WastageListParams {
  locationId?: string;
  source?: WastageSource;
  reasonCode?: string;
  /** Days back from today (0 = today). Default: 30. */
  days?: number;
}

export interface WastageListResponse {
  items: WastageEntry[];
  byReason: { code: string; label: string; quantity: number }[];
  total: number;
}

export interface CreateWastageRequest {
  locationId: string;
  productId: string;
  quantity: number;
  note?: string;
  verification: SensitiveActionContext;
}

/** BAK-001 today at a location, plus a 7-day trend. */
export interface ProductionSummary {
  locationId: LocationId;
  /** YYYY-MM-DD */
  date: string;
  planned: number;
  produced: number;
  batches: Record<ProductionBatchStatus, number>;
  /** Last 7 days incl. today: rejected + written off ÷ produced (basis points). */
  wastageBps: number;
  wastageUnits7d: number;
  producedUnits7d: number;
  lowFinishedGoods: number;
  /** Raw materials today's unstarted batches need but aren't on hand. */
  shortages: {
    ingredientId: string;
    code: string;
    name: string;
    unit: StockUnit;
    needed: number;
    onHand: number;
  }[];
  trend: { date: string; produced: number; wasted: number }[];
}
