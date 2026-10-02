import type {
  CurrencyCode,
  Money,
  ShopLedgerEntry,
  WholesaleInvoice,
  WholesaleShop,
} from '@rbp/types';
import type { MockDb, WholesaleInvoiceRecord, WholesaleShopRecord } from './db/seed';

/**
 * WHO-* balance rules (pure, shared by the seed and the handlers). A shop owes its opening
 * balance plus the credit part of each invoice, less collections and return credits. Money
 * received is applied to the oldest open item first (FIFO); a return linked to an invoice
 * pays that invoice first.
 */

export const OPENING_ID = 'OPENING';

const m = (amount: number, currency: CurrencyCode): Money => ({ amount, currency });

const pad = (n: number) => String(n).padStart(2, '0');
export const localDate = (d: Date | string) => {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

/** YYYY-MM-DD `days` after an ISO time (local). */
export function addDays(at: string, days: number) {
  const d = new Date(at);
  d.setDate(d.getDate() + days);
  return localDate(d);
}

/** A-311: a voided invoice is kept for history but owes nothing and isn't a sale. */
export const isLive = (i: WholesaleInvoiceRecord) => !i.voided;

const shopDocs = (state: MockDb, shop: WholesaleShopRecord) => {
  const all = state.wholesaleInvoices.filter(
    (i) => i.tenantId === shop.tenantId && i.shopId === shop.id,
  );
  return {
    /** Including voided invoices. */
    all,
    invoices: all.filter(isLive),
    collections: state.wholesaleCollections.filter(
      (c) => c.tenantId === shop.tenantId && c.shopId === shop.id,
    ),
    returns: state.wholesaleReturns.filter(
      (r) => r.tenantId === shop.tenantId && r.shopId === shop.id,
    ),
  };
};

/** What a shop owes, item by item (before payments), oldest first. */
function itemsOf(state: MockDb, shop: WholesaleShopRecord) {
  const items: (Omit<OpenItem, 'remaining'> & { amount: number })[] = [];
  if (shop.openingBalance > 0) {
    items.push({
      id: OPENING_ID,
      number: 'Opening balance',
      at: shop.openingAt,
      dueDate: addDays(shop.openingAt, shop.paymentTermsDays),
      amount: shop.openingBalance,
    });
  }
  for (const i of shopDocs(state, shop).invoices) {
    items.push({
      id: i.id,
      number: i.number,
      at: i.at,
      dueDate: i.dueDate,
      amount: i.credit.amount,
    });
  }
  return items.sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * Allocated so far per item id (invoice id or OPENING). Balances are derived, so money that was
 * applied to an invoice that has since been voided (A-311) is re-applied to the shop's other
 * unpaid items, oldest first; anything left over is credit the shop has with you.
 */
function allocated(state: MockDb, shop: WholesaleShopRecord) {
  const { collections, returns } = shopDocs(state, shop);
  const items = itemsOf(state, shop);
  const live = new Set(items.map((i) => i.id));
  const paid = new Map<string, number>();
  let loose = 0;
  for (const doc of [...collections, ...returns]) {
    for (const a of doc.allocations) {
      if (live.has(a.invoiceId)) {
        paid.set(a.invoiceId, (paid.get(a.invoiceId) ?? 0) + a.amount.amount);
      } else {
        loose += a.amount.amount;
      }
    }
  }
  for (const i of items) {
    if (loose <= 0) break;
    const take = Math.min(loose, i.amount - (paid.get(i.id) ?? 0));
    if (take > 0) {
      paid.set(i.id, (paid.get(i.id) ?? 0) + take);
      loose -= take;
    }
  }
  return paid;
}

export interface OpenItem {
  id: string;
  number: string;
  at: string;
  dueDate: string;
  remaining: number;
}

/** Unpaid items, oldest first. */
export function openItems(state: MockDb, shop: WholesaleShopRecord): OpenItem[] {
  const paid = allocated(state, shop);
  return itemsOf(state, shop)
    .map(({ amount, ...i }) => ({ ...i, remaining: amount - (paid.get(i.id) ?? 0) }))
    .filter((x) => x.remaining > 0);
}

/** Spread `amount` over open items (a preferred invoice first, then FIFO). */
export function allocate(
  items: OpenItem[],
  amount: number,
  currency: CurrencyCode,
  preferId?: string | null,
) {
  const ordered = preferId
    ? [...items.filter((i) => i.id === preferId), ...items.filter((i) => i.id !== preferId)]
    : items;
  const out: { invoiceId: string; invoiceNumber: string; amount: Money }[] = [];
  let left = amount;
  for (const i of ordered) {
    if (left <= 0) break;
    const take = Math.min(left, i.remaining);
    if (take > 0) {
      out.push({ invoiceId: i.id, invoiceNumber: i.number, amount: m(take, currency) });
      left -= take;
    }
  }
  return out;
}

export function outstandingOf(state: MockDb, shop: WholesaleShopRecord) {
  const { invoices, collections, returns } = shopDocs(state, shop);
  return (
    shop.openingBalance +
    invoices.reduce((s, i) => s + i.credit.amount, 0) -
    collections.reduce((s, c) => s + c.amount.amount, 0) -
    returns.reduce((s, r) => s + r.credit.amount, 0)
  );
}

export function shopView(
  state: MockDb,
  shop: WholesaleShopRecord,
  today = localDate(new Date()),
): WholesaleShop {
  const { tenantId: _t, openingBalance: _o, openingAt: _a, ...rest } = shop;
  const currency = shop.creditLimit.currency;
  const outstanding = outstandingOf(state, shop);
  const overdue = openItems(state, shop)
    .filter((i) => i.dueDate < today)
    .reduce((s, i) => s + i.remaining, 0);
  const { all, collections, returns } = shopDocs(state, shop);
  const visits = [...all, ...collections, ...returns].map((d) => d.at).sort();
  return {
    ...rest,
    outstanding: m(outstanding, currency),
    overdue: m(overdue, currency),
    overLimit: shop.creditLimit.amount > 0 && outstanding > shop.creditLimit.amount,
    lastVisitAt: visits[visits.length - 1] ?? null,
  };
}

export function invoiceView(state: MockDb, invoice: WholesaleInvoiceRecord): WholesaleInvoice {
  const { tenantId: _t, ...rest } = invoice;
  const shop = state.wholesaleShops.find((s) => s.id === invoice.shopId);
  if (invoice.voided) {
    return { ...rest, balance: m(0, invoice.credit.currency), status: 'VOIDED' };
  }
  const paid = shop ? (allocated(state, shop).get(invoice.id) ?? 0) : 0;
  const balance = Math.max(0, invoice.credit.amount - paid);
  return {
    ...rest,
    balance: m(balance, invoice.credit.currency),
    status: balance > 0 ? 'OPEN' : 'PAID',
  };
}

/** WHO-002 statement, oldest first, with a running balance. */
export function ledgerOf(state: MockDb, shop: WholesaleShopRecord): ShopLedgerEntry[] {
  const currency = shop.creditLimit.currency;
  const { all, collections, returns } = shopDocs(state, shop);
  const rows: Omit<ShopLedgerEntry, 'balance'>[] = [];
  if (shop.openingBalance) {
    rows.push({
      id: `${shop.id}:opening`,
      kind: 'OPENING',
      number: null,
      refId: null,
      description: 'Balance brought forward',
      amount: m(shop.openingBalance, currency),
      at: shop.openingAt,
    });
  }
  for (const i of all) {
    const paidNow = i.paidNow?.amount.amount ?? 0;
    rows.push({
      id: i.id,
      kind: 'INVOICE',
      number: i.number,
      refId: i.id,
      // The UI shows total / paid now from the invoice; this is the fallback text.
      description: paidNow ? 'Invoice, part paid at the shop' : 'Invoice on credit',
      amount: i.credit,
      at: i.at,
      ...(i.voided ? { voided: true } : {}),
    });
    // A-311: the void takes the invoice's credit back off on the day it was voided.
    if (i.voided) {
      rows.push({
        id: `${i.id}:void`,
        kind: 'VOID',
        number: i.number,
        refId: i.id,
        description: `Invoice voided · ${i.voided.reason.label}`,
        amount: m(-i.credit.amount, currency),
        at: i.voided.at,
      });
    }
  }
  for (const c of collections) {
    rows.push({
      id: c.id,
      kind: 'COLLECTION',
      number: c.number,
      refId: c.id,
      description: `Collection · ${c.method.replace('_', ' ').toLowerCase()}`,
      amount: m(-c.amount.amount, currency),
      at: c.at,
    });
  }
  for (const r of returns) {
    rows.push({
      id: r.id,
      kind: 'RETURN',
      number: r.number,
      refId: r.id,
      description: `Return · ${r.reason.label}`,
      amount: m(-r.credit.amount, currency),
      at: r.at,
    });
  }
  rows.sort((a, b) => a.at.localeCompare(b.at));
  let balance = 0;
  return rows.map((r) => {
    balance += r.amount.amount;
    return { ...r, balance: m(balance, currency) };
  });
}

/** Tax contained in a VAT-inclusive total. */
export const includedTax = (total: number, bps: number) =>
  bps > 0 ? Math.round((total * bps) / (10_000 + bps)) : 0;
