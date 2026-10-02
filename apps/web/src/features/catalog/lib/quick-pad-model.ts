import type { CategoryTreeNode, LocationProduct, QuickPadLayout } from '@rbp/types';

/** A category as the Quick Pad shows it at one location. */
export interface PadCategory {
  id: string;
  parentId: string | null;
  /** In the UI language when `localize` was given. */
  name: string;
  /** Location override, else the category colour. */
  color: string;
  imageUrl: string | null;
  /** Products directly in this category, in button order. */
  products: LocationProduct[];
  /** Products in this category and all descendants. */
  total: number;
}

export interface PadModel {
  byId: Map<string, PadCategory>;
  /** Visible (has products somewhere below) children of a level, in button order. */
  childrenOf: (parentId: string | null) => PadCategory[];
  /** All children regardless of products (designer). */
  allChildrenOf: (parentId: string | null) => PadCategory[];
}

/**
 * Join the category tree, the location's layout and what it sells into the Quick Pad structure.
 * Shared by POS-001 and the CAT-007 designer so the preview is exactly what cashiers see.
 */
export function buildPadModel(
  tree: CategoryTreeNode[],
  products: LocationProduct[],
  layout: Pick<QuickPadLayout, 'categoryOrder' | 'categoryColors' | 'productOrder'> | undefined,
  localize: (item: {
    name: string;
    nameTranslations?: CategoryTreeNode['nameTranslations'];
  }) => string = (item) => item.name,
): PadModel {
  const order = new Map((layout?.categoryOrder ?? tree.map((c) => c.id)).map((id, i) => [id, i]));
  const rank = (id: string) => order.get(id) ?? Number.MAX_SAFE_INTEGER;

  const byProduct = new Map<string, LocationProduct[]>();
  for (const p of products.filter((x) => x.showOnQuickPad !== false))
    byProduct.set(p.categoryId, [...(byProduct.get(p.categoryId) ?? []), p]);

  const byId = new Map<string, PadCategory>();
  for (const c of tree) {
    const direct = byProduct.get(c.id) ?? [];
    const productRank = new Map(
      (layout?.productOrder[c.id] ?? []).map((id, i) => [id as string, i]),
    );
    byId.set(c.id, {
      id: c.id,
      parentId: c.parentId,
      name: localize(c),
      color: layout?.categoryColors[c.id] ?? c.color,
      imageUrl: c.imageUrl,
      products: [...direct].sort(
        (a, b) =>
          (productRank.get(a.productId) ?? Number.MAX_SAFE_INTEGER) -
            (productRank.get(b.productId) ?? Number.MAX_SAFE_INTEGER) ||
          a.quickPadOrder - b.quickPadOrder,
      ),
      total: 0,
    });
  }
  // Tree is depth-first, so walking it backwards adds children before parents.
  for (const c of [...tree].reverse()) {
    const node = byId.get(c.id);
    if (!node) continue;
    node.total += node.products.length;
    if (c.parentId) {
      const parent = byId.get(c.parentId);
      if (parent) parent.total += node.total;
    }
  }

  const allChildrenOf = (parentId: string | null) =>
    [...byId.values()]
      .filter((c) => c.parentId === parentId)
      .sort((a, b) => rank(a.id) - rank(b.id));
  return {
    byId,
    allChildrenOf,
    childrenOf: (parentId) => allChildrenOf(parentId).filter((c) => c.total > 0),
  };
}

/**
 * Reorder `ids` (siblings) inside the global `order`, keeping the slots the siblings occupy.
 * Non-sibling positions never move.
 */
export function reorderWithin(order: string[], siblingsInNewOrder: string[]): string[] {
  const siblingSet = new Set(siblingsInNewOrder);
  const queue = [...siblingsInNewOrder];
  return order.map((id) => (siblingSet.has(id) ? (queue.shift() ?? id) : id));
}
