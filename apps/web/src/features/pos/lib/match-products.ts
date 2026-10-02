import type { LocationProduct } from '@rbp/types';
import { localizedName } from '@/features/catalog/lib/localized-name';

/**
 * Quantity prefix for fast entry: "3*s01", "3 x kottu", "3×milk" → { quantity: 3, term: … }.
 * Without a prefix the quantity is 1.
 */
export function parseQuantityPrefix(input: string): { quantity: number; term: string } {
  const match = /^\s*(\d{1,3})\s*[*x×]\s*(.+)$/i.exec(input);
  if (match) {
    const quantity = Number(match[1]);
    if (quantity >= 1) return { quantity, term: (match[2] ?? '').trim() };
  }
  return { quantity: 1, term: input.trim() };
}

/** Exact product code or barcode (scanner / typed code). */
export function findByCode(products: LocationProduct[], code: string) {
  const c = code.trim().toLowerCase();
  if (!c) return undefined;
  return products.find(
    (p) => p.code.toLowerCase() === c || p.barcodes.some((b) => b.toLowerCase() === c),
  );
}

/**
 * Match English and translated names, codes and barcodes. Exact code/barcode matches first,
 * then names that start with the term, then the rest (each in catalog order).
 */
export function matchProducts(
  products: LocationProduct[],
  term: string,
  language: string,
): LocationProduct[] {
  const q = term.trim().toLowerCase();
  if (!q) return products;
  const rank = (p: LocationProduct) => {
    const name = p.name.toLowerCase();
    const local = localizedName(p, language).toLowerCase();
    if (p.code.toLowerCase() === q || p.barcodes.includes(q)) return 0;
    if (name.startsWith(q) || local.startsWith(q)) return 1;
    if (
      name.includes(q) ||
      local.includes(q) ||
      p.code.toLowerCase().includes(q) ||
      p.barcodes.some((b) => b.includes(q))
    )
      return 2;
    return -1;
  };
  return products
    .map((p, i) => ({ p, r: rank(p), i }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.p);
}
