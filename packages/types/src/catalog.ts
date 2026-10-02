import type { LocationStock, StockUnit } from './inventory';
import type { SensitiveActionContext } from './audit';
import type {
  CategoryId,
  IsoDateTime,
  LocationId,
  Money,
  Paginated,
  ProductId,
  TenantId,
} from './common';

/** Names in the other UI languages (REQ-861…883). English `name` is the fallback. */
export type NameTranslations = Partial<Record<'ta' | 'si', string>>;

/**
 * Button image as a data: URL (downscaled on upload) or an https URL. The real API will store
 * an uploaded asset and return its URL; the contract is the same.
 */
export type ImageUrl = string;

/**
 * CAT-001/002. Tenant-wide and multi-level (REQ-114…136: Rice → Fried Rice → …).
 * Availability and price per location live on LocationProduct.
 */
export interface Category {
  id: CategoryId;
  tenantId: TenantId;
  /** null = top level. */
  parentId: CategoryId | null;
  code: string;
  name: string;
  nameTranslations: NameTranslations;
  /** Any CSS colour; drives Quick Pad tile accents. */
  color: string;
  imageUrl: ImageUrl | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** A category in depth-first tree order (`GET /categories?tree=true`). */
export interface CategoryTreeNode extends Category {
  depth: number;
  /** Ancestor names from the root, excluding this category. */
  path: string[];
  childCount: number;
  /** Products directly in this category (not descendants). */
  productCount: number;
}

export type TaxMode = 'INCLUSIVE' | 'EXCLUSIVE';

/** CAT-003/004. Tenant-wide product master. */
export type ProductKind = 'ITEM' | 'INGREDIENT';

/** REC-004, e.g. "150 g boneless", 150 g, a 1 kg pack = 6 portions. Prototype shape. */
export interface PortionDefinition {
  description: string;
  grams?: number;
  perPack?: number;
}

export interface Product {
  id: ProductId;
  tenantId: TenantId;
  categoryId: CategoryId;
  /** SKU / PLU, unique per tenant. */
  code: string;
  name: string;
  nameTranslations: NameTranslations;
  description?: string;
  imageUrl: ImageUrl | null;
  basePrice: Money;
  taxMode: TaxMode;
  barcodes: string[];
  isActive: boolean;
  showOnQuickPad: boolean;
  /** How stock is counted (INV-*); pcs when unset. */
  stockUnit?: StockUnit;
  /** REC-001: kitchen ingredients are stock-only products, never sold on the POS. Unset = ITEM. */
  kind?: ProductKind;
  /** REC-004: what one portion of an ingredient is. */
  portion?: PortionDefinition;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/**
 * A product as sold at one location (CAT-005/006, POS-001).
 * `price` is the effective selling price: `priceOverride ?? product.basePrice`.
 */
export interface LocationProduct {
  productId: ProductId;
  locationId: LocationId;
  categoryId: CategoryId;
  code: string;
  name: string;
  nameTranslations: NameTranslations;
  imageUrl: ImageUrl | null;
  /** For scanner / code entry at the POS (POS-002). */
  barcodes: string[];
  taxMode: TaxMode;
  price: Money;
  priceOverride: Money | null;
  isAvailable: boolean;
  /** e.g. "3 left". */
  stockNote?: string;
  quickPadOrder: number;
  /** false = still sold (search / scan) but gets no Quick Pad button. */
  showOnQuickPad?: boolean;
  /** Sold at this location. Only `false` in the back-office view (`all=true`). */
  enabled: boolean;
  /** Where the KOT prints / kitchen display routes this item (REQ-354…361). null = no KOT. */
  stationId: string | null;
  /** Service charge applies to this item at this location (REQ-463…483). */
  serviceCharge: boolean;
  /** Live stock here (INV-*); null when not tracked. At 0 it can't be sold. */
  stock?: LocationStock | null;
}

/** A kitchen/bar/bakery station at a location, with the printer its tickets go to. */
export interface KitchenStation {
  id: string;
  locationId: LocationId;
  code: string;
  name: string;
  /** Simulated printer name (hardware is simulated in the prototype, INS-421…434). */
  printerName: string;
}

export interface LocationProductListParams {
  /** Back office only: another allowed location instead of the X-Location-Id one. */
  locationId?: string;
  /** Include products this location does not sell (enabled: false). Requires catalog.manage. */
  all?: boolean;
}

/** CAT-005: switch a product on/off for a location and set its availability. Never deletes. */
export interface UpdateLocationProductRequest {
  enabled?: boolean;
  isAvailable?: boolean;
  stockNote?: string | null;
  stationId?: string | null;
  serviceCharge?: boolean;
}

/** CAT-006 price grid row. `prices[locationId]` is the location override (null = uses base price). */
export interface PriceMatrixRow {
  productId: ProductId;
  code: string;
  name: string;
  categoryId: CategoryId;
  basePrice: Money;
  prices: Record<string, Money | null>;
  /** Whether the product is sold at each location. */
  enabled: Record<string, boolean>;
}

export interface PriceMatrix extends Paginated<PriceMatrixRow> {
  locations: { id: LocationId; code: string; name: string }[];
}

export interface PriceMatrixParams {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
}

export interface PriceChange {
  productId: string;
  /** null = the tenant-wide base price. */
  locationId: string | null;
  /** null clears a location override (not allowed for the base price). */
  price: Money | null;
}

export interface UpdatePricesRequest {
  changes: PriceChange[];
  /** Required when any change lowers an effective selling price (pos.price.override, REQ-224). */
  verification?: SensitiveActionContext;
}

export interface UpdatePricesResponse {
  updated: number;
}

/**
 * CAT-007 Quick Pad layout. Resolved Location → Device (INS-297…321): a device uses its own
 * layout when one is saved, otherwise the location's, otherwise the catalog default order.
 */
export interface QuickPadLayout {
  locationId: LocationId;
  /** Set when this layout (or the request) is for one device. */
  deviceId: string | null;
  /** Where the returned order came from. */
  source: 'device' | 'location' | 'default';
  /** Every category id in display order; siblings are ordered by their position here. */
  categoryOrder: string[];
  /** Per-location button colour overrides. */
  categoryColors: Record<string, string>;
  /** Product id button order per category id. */
  productOrder: Record<string, string[]>;
  updatedAt: IsoDateTime | null;
}

export type UpdateQuickPadLayoutRequest = Pick<
  QuickPadLayout,
  'categoryOrder' | 'categoryColors' | 'productOrder'
>;

export interface ListParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface CategoryListParams extends ListParams {
  active?: boolean;
  /** Direct children of this category ('root' = top level). */
  parentId?: string;
}

export interface CategoryTreeParams {
  active?: boolean;
}

export interface ProductListParams extends ListParams {
  /** Matches the category and all of its descendants. */
  categoryId?: string;
  active?: boolean;
}

export interface CreateCategoryRequest {
  code: string;
  name: string;
  nameTranslations?: NameTranslations;
  color: string;
  imageUrl?: ImageUrl | null;
  parentId?: string | null;
  sortOrder?: number;
}

export type UpdateCategoryRequest = Partial<CreateCategoryRequest> & { isActive?: boolean };

export interface CreateProductRequest {
  categoryId: string;
  code: string;
  name: string;
  nameTranslations?: NameTranslations;
  description?: string;
  imageUrl?: ImageUrl | null;
  basePrice: Money;
  taxMode: TaxMode;
  barcodes?: string[];
  showOnQuickPad?: boolean;
}

export type UpdateProductRequest = Partial<CreateProductRequest> & { isActive?: boolean };
