import type {
  Customer,
  CustomerDetail,
  CustomerLedgerEntry,
  CustomerListResponse,
  CustomerPayment,
  CustomerPhone,
  Money,
  Order,
} from '@rbp/types';
import { formatMoney, newId, normalizePhone, nowIso } from '@rbp/utils';
import {
  customerFormSchema,
  customerUpdateSchema,
  quickCustomerSchema,
  receiveCustomerPaymentSchema,
} from '@rbp/validation';
import { http, HttpResponse } from 'msw';
import { recordAudit } from '../audit';
import { type MockContext, requirePermission, resolveContext } from '../context';
import { db } from '../db';
import { API, handle, MockHttpError, paginate, parseBody } from '../http';

/** POS-003 lookup / quick create and CUS-001…005 customer management. */

const tenantCustomers = (ctx: MockContext) =>
  db.get().customers.filter((c) => c.tenantId === ctx.me.tenant.id);

function findCustomer(ctx: MockContext, id: string): Customer {
  const customer = tenantCustomers(ctx).find((c) => c.id === id);
  if (!customer) throw new MockHttpError('NOT_FOUND', 404, 'Customer not found');
  return customer;
}
/** One phone number belongs to one customer per tenant. */
function assertPhoneFree(ctx: MockContext, phone: string, exceptId?: string, field = 'phone') {
  const owner = tenantCustomers(ctx).find(
    (c) => c.id !== exceptId && c.phones.some((p) => p.number === phone),
  );
  if (owner) {
    throw new MockHttpError('CONFLICT', 409, 'Phone already belongs to a customer', {
      customerId: owner.id,
      customerName: owner.name,
      phone,
      fieldErrors: { [field]: 'validation.phoneTaken' },
    });
  }
}

/** Blank optional text clears the field instead of storing "". */
function withText<T extends object>(
  base: T,
  fields: Partial<Record<'address' | 'deliveryAddress' | 'notes', string | undefined>>,
): T {
  const given = Object.entries(fields).filter(
    (e): e is [string, string] => typeof e[1] === 'string',
  );
  const cleared = new Set(given.filter(([, v]) => !v.trim()).map(([k]) => k));
  const kept = Object.fromEntries(given.filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]));
  const rest = Object.fromEntries(Object.entries(base).filter(([k]) => !cleared.has(k)));
  return { ...rest, ...kept } as T;
}

const cleanPhones = (phones: { number: string; label?: string | undefined; primary: boolean }[]) =>
  // Primary first, so lists and receipts show it.
  [...phones]
    .sort((a, b) => Number(b.primary) - Number(a.primary))
    .map((p): CustomerPhone => ({
      number: p.number,
      primary: p.primary,
      ...(p.label?.trim() ? { label: p.label.trim() } : {}),
    }));

const customerOrders = (ctx: MockContext, customerId: string) =>
  db
    .get()
    .orders.filter((o) => o.tenantId === ctx.me.tenant.id && o.customer?.id === customerId)
    .sort((a, b) => (b.paidAt ?? b.createdAt).localeCompare(a.paidAt ?? a.createdAt));

const money = (ctx: MockContext, amount: number): Money => ({
  amount,
  currency: ctx.me.tenant.currency,
});

function detailOf(ctx: MockContext, customer: Customer): CustomerDetail {
  const paid = customerOrders(ctx, customer.id).filter((o) => o.status === 'PAID');
  const spent = paid.reduce(
    (s, o) => s + o.totals.total.amount - o.returns.reduce((r, x) => r + x.amount.amount, 0),
    0,
  );
  return {
    ...customer,
    stats: {
      orderCount: paid.length,
      totalSpent: money(ctx, spent),
      averageOrder: money(ctx, paid.length ? Math.round(spent / paid.length) : 0),
      lastOrderAt: paid[0]?.paidAt ?? customer.lastOrderAt,
    },
  };
}

/**
 * CUS-005 statement: balance brought forward, credit sales, credit returns and voids
 * (from the orders themselves) and payments received — oldest first with a running balance.
 */
function ledgerOf(ctx: MockContext, customer: Customer): CustomerLedgerEntry[] {
  const state = db.get();
  type Raw = Omit<CustomerLedgerEntry, 'balance' | 'amount'> & { amount: number };
  const raw: Raw[] = [];
  const opening = state.customerOpeningBalances[customer.id];
  if (opening) {
    raw.push({
      id: `opening_${customer.id}`,
      at: opening.at,
      kind: 'OPENING',
      reference: 'Brought forward',
      orderId: null,
      locationId: null,
      amount: opening.amount,
      by: null,
    });
  }
  for (const o of customerOrders(ctx, customer.id)) {
    const credit = o.payments.find((p) => p.kind === 'SALE' && p.method === 'CREDIT');
    if (!credit) continue;
    const base = { orderId: o.id, locationId: o.locationId };
    raw.push({
      ...base,
      id: `sale_${o.id}`,
      at: o.paidAt ?? credit.createdAt,
      kind: 'CREDIT_SALE',
      reference: o.number,
      amount: credit.amount.amount,
      by: credit.createdBy,
    });
    for (const r of o.returns.filter((x) => x.refundMethod === 'CREDIT')) {
      raw.push({
        ...base,
        id: `return_${r.id}`,
        at: r.createdAt,
        kind: 'RETURN',
        reference: r.number,
        amount: -r.amount.amount,
        by: r.createdBy,
      });
    }
    if (o.status === 'VOIDED' && o.cancellation) {
      raw.push({
        ...base,
        id: `void_${o.id}`,
        at: o.cancellation.at,
        kind: 'VOID',
        reference: o.number,
        amount: -credit.amount.amount,
        by: o.cancellation.approvedBy.fullName,
      });
    }
  }
  for (const p of state.customerPayments.filter(
    (x) => x.tenantId === ctx.me.tenant.id && x.customerId === customer.id,
  )) {
    raw.push({
      id: p.id,
      at: p.at,
      kind: 'PAYMENT',
      reference: p.number,
      orderId: null,
      locationId: p.locationId,
      amount: -p.amount.amount,
      by: p.receivedBy,
    });
  }
  let balance = 0;
  return raw
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((e) => {
      balance = Math.max(0, balance + e.amount);
      return { ...e, amount: money(ctx, e.amount), balance: money(ctx, balance) };
    });
}

function save(customer: Customer) {
  db.update((d) => {
    d.customers = d.customers.map((c) => (c.id === customer.id ? customer : c));
  });
}

/**
 * Search typed digits against a stored +94… number, as international (94…) or local (0…), so
 * "077 110 0105", "0771100105" and "94771100105" all find +94771100105. Needs 3+ digits.
 */
export const phoneMatches = (e164: string, digits: string | undefined) =>
  !!digits && digits.length >= 3 && (e164.includes(digits) || `0${e164.slice(3)}`.includes(digits));

export const customerHandlers = [
  /** CUS-001 list / POS-003 lookup. */
  http.get(
    `${API}/customers`,
    handle(({ request }) => {
      const ctx = resolveContext(request);
      requirePermission(ctx, 'customer.view');
      const url = new URL(request.url);
      const p = url.searchParams;
      const all = tenantCustomers(ctx);
      const phone = p.get('phone');
      let items = all;
      if (phone) {
        const e164 = normalizePhone(phone);
        items = e164 ? items.filter((c) => c.phones.some((x) => x.number === e164)) : [];
      } else {
        const q = p.get('search')?.trim().toLowerCase();
        const digits = q?.replace(/\D/g, '');
        if (q) {
          items = items.filter(
            (c) =>
              c.name.toLowerCase().includes(q) ||
              c.phones.some((x) => phoneMatches(x.number, digits)),
          );
        }
        const type = p.get('type');
        if (type) items = items.filter((c) => c.type === type);
        if (p.get('owes') === 'true') items = items.filter((c) => c.outstanding.amount > 0);
        const sort = p.get('sort');
        items = [...items].sort((a, b) =>
          sort === 'outstanding'
            ? b.outstanding.amount - a.outstanding.amount || a.name.localeCompare(b.name)
            : sort === 'lastOrder'
              ? (b.lastOrderAt ?? '').localeCompare(a.lastOrderAt ?? '') ||
                a.name.localeCompare(b.name)
              : a.name.localeCompare(b.name),
        );
      }
      const owing = all.filter((c) => c.outstanding.amount > 0);
      const body: CustomerListResponse = {
        ...paginate(items, url),
        summary: {
          totalOutstanding: money(
            ctx,
            owing.reduce((s, c) => s + c.outstanding.amount, 0),
          ),
          owingCount: owing.length,
        },
      };
      return HttpResponse.json(body);
    }),
  ),

  /** CUS-003 detail with purchase stats across all locations. */
  http.get(
    `${API}/customers/:id`,
    handle(({ request, params }) => {
      const ctx = resolveContext(request);
      requirePermission(ctx, 'customer.view');
      return HttpResponse.json(detailOf(ctx, findCustomer(ctx, String(params.id))));
    }),
  ),

  /** CUS-004 every order for the customer, all locations, newest first. */
  http.get(
    `${API}/customers/:id/orders`,
    handle(({ request, params }) => {
      const ctx = resolveContext(request);
      requirePermission(ctx, 'customer.view');
      const customer = findCustomer(ctx, String(params.id));
      const url = new URL(request.url);
      const status = url.searchParams.get('status');
      const items = customerOrders(ctx, customer.id)
        .filter((o) => !status || o.status === status)
        .map(({ tenantId: _t, ...o }): Order => o);
      return HttpResponse.json(paginate(items, url));
    }),
  ),

  /** CUS-005 statement with running balance. */
  http.get(
    `${API}/customers/:id/ledger`,
    handle(({ request, params }) => {
      const ctx = resolveContext(request);
      requirePermission(ctx, 'customer.view');
      return HttpResponse.json(ledgerOf(ctx, findCustomer(ctx, String(params.id))));
    }),
  ),

  /**
   * POS-003 quick create (`phone`; anyone who sells) or CUS-002 full create (`phones`;
   * customer.manage).
   */
  http.post(
    `${API}/customers`,
    handle(async ({ request }) => {
      const ctx = resolveContext(request);
      const raw = (await request
        .clone()
        .json()
        .catch(() => ({}))) as { phones?: unknown };
      const full = Array.isArray(raw.phones);
      if (full || !ctx.permissions.has('pos.sale.create')) {
        requirePermission(ctx, 'customer.manage');
      }
      const now = nowIso();
      let customer: Customer;
      if (full) {
        const input = await parseBody(request, customerFormSchema);
        input.phones.forEach((ph, i) =>
          assertPhoneFree(ctx, ph.number, undefined, `phones.${i}.number`),
        );
        customer = withText(
          {
            id: newId('cus') as Customer['id'],
            tenantId: ctx.me.tenant.id,
            name: input.name,
            type: input.type,
            phones: cleanPhones(input.phones),
            outstanding: money(ctx, 0),
            lastOrderAt: null,
            createdAt: now,
            updatedAt: now,
          },
          { address: input.address, deliveryAddress: input.deliveryAddress, notes: input.notes },
        );
      } else {
        const input = await parseBody(request, quickCustomerSchema);
        assertPhoneFree(ctx, input.phone);
        customer = withText(
          {
            id: newId('cus') as Customer['id'],
            tenantId: ctx.me.tenant.id,
            name: input.name,
            type: input.type ?? 'RETAIL',
            phones: [{ number: input.phone, primary: true }],
            outstanding: money(ctx, 0),
            lastOrderAt: null,
            createdAt: now,
            updatedAt: now,
          },
          { address: input.address, notes: input.notes },
        );
      }
      db.update((d) => {
        d.customers.push(customer);
      });
      recordAudit(ctx, {
        action: 'customer.create',
        entity: 'customer',
        entityId: customer.id,
        entityLabel: customer.name,
        before: null,
        after: customer,
      });
      return HttpResponse.json(customer, { status: 201 });
    }),
  ),

  /** CUS-002 edit. `phones` replaces the list; legacy `phone` makes that number primary. */
  http.patch(
    `${API}/customers/:id`,
    handle(async ({ request, params }) => {
      const ctx = resolveContext(request);
      requirePermission(ctx, 'customer.manage');
      const existing = findCustomer(ctx, String(params.id));
      const { phone, phones, address, deliveryAddress, notes, ...input } = await parseBody(
        request,
        customerUpdateSchema,
      );
      let nextPhones = existing.phones;
      if (phones) {
        phones.forEach((ph, i) =>
          assertPhoneFree(ctx, ph.number, existing.id, `phones.${i}.number`),
        );
        nextPhones = cleanPhones(phones);
      } else if (phone) {
        assertPhoneFree(ctx, phone, existing.id);
        nextPhones = [
          { number: phone, primary: true },
          ...existing.phones
            .filter((x) => x.number !== phone)
            .map((x) => ({ ...x, primary: false })),
        ];
      }
      const updated = withText<Customer>(
        { ...existing, ...input, phones: nextPhones, updatedAt: nowIso() },
        { address, deliveryAddress, notes },
      );
      save(updated);
      recordAudit(ctx, {
        action: 'customer.update',
        entity: 'customer',
        entityId: existing.id,
        entityLabel: updated.name,
        before: existing,
        after: updated,
      });
      return HttpResponse.json(updated);
    }),
  ),

  /**
   * CUS-005 receive a payment on account. Whoever handles cash (pos.drawer.open) or manages
   * customers; never more than is owed. Audited.
   */
  http.post(
    `${API}/customers/:id/payments`,
    handle(async ({ request, params }) => {
      const ctx = resolveContext(request);
      if (!ctx.permissions.has('pos.drawer.open')) requirePermission(ctx, 'customer.manage');
      const customer = findCustomer(ctx, String(params.id));
      const input = await parseBody(request, receiveCustomerPaymentSchema);
      if (input.amount.amount > customer.outstanding.amount) {
        throw new MockHttpError('VALIDATION_FAILED', 400, 'More than the customer owes', {
          fieldErrors: { amount: 'validation.amountTooHigh' },
        });
      }
      const sequenceKey = `PAY:${ctx.me.tenant.id}`;
      const next = (db.get().orderSequences[sequenceKey] ?? 0) + 1;
      const payment: CustomerPayment = {
        id: newId('cpy'),
        customerId: customer.id,
        number: `PAY-${String(next).padStart(6, '0')}`,
        amount: money(ctx, input.amount.amount),
        method: input.method,
        ...(input.reference ? { reference: input.reference } : {}),
        ...(input.note ? { note: input.note } : {}),
        locationId: ctx.me.currentLocation?.id ?? null,
        receivedBy: ctx.me.user.displayName,
        at: nowIso(),
      };
      const updated: Customer = {
        ...customer,
        outstanding: money(ctx, customer.outstanding.amount - payment.amount.amount),
        updatedAt: payment.at,
      };
      db.update((d) => {
        d.orderSequences[sequenceKey] = next;
        d.customerPayments.push({ ...payment, tenantId: ctx.me.tenant.id });
      });
      save(updated);
      recordAudit(ctx, {
        action: 'customer.payment',
        entity: 'customer',
        entityId: customer.id,
        entityLabel: `${payment.number} · ${customer.name} · ${input.method.replace('_', ' ')} · ${formatMoney(payment.amount)}`,
        before: { outstanding: customer.outstanding },
        after: { outstanding: updated.outstanding },
      });
      return HttpResponse.json({ payment, customer: updated });
    }),
  ),
];
