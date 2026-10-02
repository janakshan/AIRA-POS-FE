import type { PortionDefinition } from './catalog';
import type { IsoDateTime, LocationId } from './common';
import type { StockStatus, StockUnit } from './inventory';

/**
 * REC-001…005 kitchen recipes. PROTOTYPE SHAPES — ingredient-as-product, one recipe per dish and
 * the prepared-item queue are for the demo and get finalized after client approval.
 */

export interface IngredientLevel {
  locationId: LocationId;
  onHand: number;
  minStock: number;
  status: StockStatus;
}

/** REC-001: a stock-only product (`kind: 'INGREDIENT'`). */
export interface Ingredient {
  id: string;
  code: string;
  name: string;
  unit: StockUnit;
  portion?: PortionDefinition;
  isActive: boolean;
  /** Active recipes that use it. */
  usedIn: { productId: string; name: string }[];
  /** At the requested location(s). */
  levels: IngredientLevel[];
}

export interface IngredientListParams {
  /** A location id or 'all'. Default: current. */
  locationId?: string;
  search?: string;
}

export interface IngredientRequest {
  code: string;
  name: string;
  unit: StockUnit;
  portion?: PortionDefinition | null;
  /** Low-stock minimum at `locationId` (default: current location). */
  minStock?: number;
  locationId?: string;
}

export interface RecipeLine {
  ingredientId: string;
  /** Whole units of the ingredient per serving. */
  quantity: number;
}

export interface RecipeLineDetail extends RecipeLine {
  code: string;
  name: string;
  unit: StockUnit;
  onHand: number;
}

export interface RecipeAvailability {
  locationId: LocationId;
  /** From ingredients plus prepared units. */
  canMake: number;
  fromIngredients: number;
  prepared: number;
  limitedBy: { ingredientId: string; name: string } | null;
}

/** REC-002/003: what one serving of a menu item uses. Keyed by the dish. */
export interface Recipe {
  productId: string;
  productCode: string;
  productName: string;
  /** Paused = the dish goes back to finished-stock tracking. */
  isActive: boolean;
  note?: string;
  lines: RecipeLineDetail[];
  availability: RecipeAvailability;
  updatedAt: IsoDateTime;
  updatedBy: string;
}

export interface RecipeListResponse {
  recipes: Recipe[];
  /** Sellable items with no recipe (tracked as finished stock). */
  withoutRecipe: { productId: string; code: string; name: string }[];
}

export interface SaveRecipeRequest {
  lines: RecipeLine[];
  isActive: boolean;
  note?: string;
}

/** REC-004 "Today's requirement" inputs; the page does the arithmetic. */
export interface RecipePlanning {
  locationId: LocationId;
  dishes: {
    productId: string;
    code: string;
    name: string;
    /** Paid servings per day over the last 30 days (rounded up). */
    averageDaily: number;
    lines: RecipeLine[];
  }[];
  ingredients: {
    id: string;
    code: string;
    name: string;
    unit: StockUnit;
    onHand: number;
    minStock: number;
    portion?: PortionDefinition;
  }[];
}

export type PreparedItemStatus = 'AVAILABLE' | 'EXPIRED' | 'USED' | 'DISPOSED';
export type PreparedOutcome = 'WASTAGE' | 'STAFF_MEAL' | 'DISPOSED' | 'OTHER';

/** REC-005: cooked food waiting to be resold (SCN-004 "Resell", or made extra). */
export interface PreparedItem {
  id: string;
  productId: string;
  productName: string;
  locationId: LocationId;
  quantity: number;
  remaining: number;
  source: { kind: 'KOT_CANCEL' | 'MANUAL'; orderId?: string; orderNumber?: string };
  note?: string;
  /** EXPIRED is derived: still AVAILABLE in the data but past `expiresAt`. */
  status: PreparedItemStatus;
  preparedAt: IsoDateTime;
  preparedBy: string;
  expiresAt: IsoDateTime;
  uses: { orderId: string; orderNumber: string; quantity: number; at: IsoDateTime }[];
  disposal?: {
    outcome: PreparedOutcome;
    reason: string;
    quantity: number;
    by: string;
    at: IsoDateTime;
  };
}

export interface PreparedItemListParams {
  locationId?: string;
  status?: PreparedItemStatus;
}

export interface CreatePreparedItemRequest {
  productId: string;
  quantity: number;
  /** Hours until it must be sold (default 4). */
  shelfLifeHours?: number;
  note?: string;
}

export interface DisposePreparedItemRequest {
  outcome: PreparedOutcome;
  reason: string;
}
