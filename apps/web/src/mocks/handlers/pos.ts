import type { SaleAdjustment } from '@rbp/types';
import { formatMoney, newId, nowIso } from '@rbp/utils';
import { createAdjustmentSchema, drawerEventSchema, voidAdjustmentSchema } from '@rbp/validation';
import { http, HttpResponse } from 'msw';
import { recordAudit, requireVerifiedAction, type VerifiedAction } from '../audit';
import { type MockContext, requirePermission, resolveContext } from '../context';
import { db } from '../db';
import { paymentMethodsFor } from '../payments';
import { API, handle, MockHttpError, parseBody } from '../http';

const fieldError = (field: string, key: string, message: string, details = {}) =>
  new MockHttpError('VALIDATION_FAILED', 400, message, {
    fieldErrors: { [field]: key },
    ...details,
  });

function requireSeller(ctx: MockContext) {
  if (!ctx.permissions.has('catalog.view')) requirePermission(ctx, 'pos.sale.create');
}

function settingsFor(locationId: string) {
  return (
    db.get().posSettings.find((s) => s.locationId === locationId) ?? {
      locationId,
      serviceChargeBps: 0,
      taxRateBps: 0,
      taxLabel: 'Tax',
      maxDiscountBps: 5000,
      returnWindowDays: 30,
      receiptFooter: 'Thank you!',
    }
  );
}

const describeValue = (
  mode: 'PERCENT' | 'FIXED',
  value: number,
  currency: 'LKR' | 'USD' | 'INR',
) => (mode === 'PERCENT' ? `${value / 100}%` : formatMoney({ amount: value, currency }));

/** "… · Main Restaurant · Counter POS 1" — where the change happened, for the audit list. */
const where = (ctx: MockContext) =>
  [ctx.me.currentLocation?.name, ctx.me.device?.name].filter(Boolean).join(' · ');

export const posHandlers = [
  /** Tax / service-charge settings for the current location (POS-001 totals). */
  http.get(
    `${API}/pos-settings`,
    handle(({ request }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requireSeller(ctx);
      return HttpResponse.json(settingsFor(ctx.me.currentLocation!.id));
    }),
  ),

  /** POS-005 charge types configured for the current location. */
  http.get(
    `${API}/charge-types`,
    handle(({ request }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requireSeller(ctx);
      return HttpResponse.json(db.get().chargeTypes[ctx.me.currentLocation!.id] ?? []);
    }),
  ),

  /** SET-006 payment methods the business accepts (POS payment, customer payments). */
  http.get(
    `${API}/payment-methods`,
    handle(({ request }) => {
      const ctx = resolveContext(request);
      return HttpResponse.json(paymentMethodsFor(ctx.me.tenant.id));
    }),
  ),

  /** POS-004 promotions for the tenant. */
  http.get(
    `${API}/promotions`,
    handle(({ request }) => {
      const ctx = resolveContext(request);
      requireSeller(ctx);
      return HttpResponse.json(db.get().promotions[ctx.me.tenant.id] ?? []);
    }),
  ),

  /**
   * Approve a discount or charge on a sale (REQ-217…232, REQ-463…491). Discounts always need an
   * employee PIN with pos.discount.apply; charges at their configured default don't, anything
   * else (custom amount, service waiver/rate change, other charge) needs pos.charge.manage.
   */
  http.post(
    `${API}/pos/adjustments`,
    handle(async ({ request }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requireSeller(ctx);
      const input = await parseBody(request, createAdjustmentSchema);
      const location = ctx.me.currentLocation!;
      const currency = ctx.me.tenant.currency;

      if (input.scope === 'LINE') {
        const exists = db
          .get()
          .products.some((p) => p.id === input.productId && p.tenantId === ctx.me.tenant.id);
        if (!exists) throw fieldError('productId', 'validation.required', 'Unknown product');
      }

      let mode = input.mode ?? 'FIXED';
      let value = input.value ?? 0;
      let label: string;
      let verified: VerifiedAction | undefined;
      let action: string;
      let previousValue: number | undefined;

      if (input.kind === 'PRICE') {
        // REQ-224: change the selling price of one item on this sale.
        const product = db.get().products.find((p) => p.id === input.productId)!;
        const row = db
          .get()
          .locationProducts.find(
            (r) =>
              r.locationId === location.id &&
              r.productId === product.id &&
              r.tenantId === ctx.me.tenant.id,
          );
        previousValue = (row?.priceOverride ?? product.basePrice).amount;
        label = `Price ${formatMoney({ amount: value, currency })}`;
        verified = requireVerifiedAction(ctx, input.verification, 'pos.price.override');
        action = 'pos.price.override';
      } else if (input.kind === 'DISCOUNT') {
        if (input.promotionCode) {
          const promo = (db.get().promotions[ctx.me.tenant.id] ?? []).find(
            (p) => p.code === input.promotionCode,
          );
          if (!promo || promo.scope !== input.scope) {
            throw fieldError('promotionCode', 'validation.required', 'Promotion not available');
          }
          ({ mode, value } = promo);
          label = promo.name;
        } else {
          const max = settingsFor(location.id).maxDiscountBps;
          if (mode === 'PERCENT' && value > max) {
            throw fieldError('value', 'validation.discountTooHigh', 'Over the discount limit', {
              maxBps: max,
            });
          }
          label = `${describeValue(mode, value, currency)} discount`;
        }
        verified = requireVerifiedAction(ctx, input.verification, 'pos.discount.apply');
        action = 'pos.discount.apply';
      } else {
        const type = (db.get().chargeTypes[location.id] ?? []).find(
          (c) => c.code === input.chargeCode,
        );
        if (!type) throw fieldError('chargeCode', 'validation.required', 'Charge not offered here');
        const atDefault =
          type.code !== 'SERVICE' &&
          type.code !== 'OTHER' &&
          mode === type.mode &&
          value === type.defaultValue;
        if (type.code === 'SERVICE' && mode !== 'PERCENT') {
          throw fieldError('mode', 'validation.required', 'Service charge is a percentage');
        }
        label = type.code === 'OTHER' ? (input.label ?? type.name) : type.name;
        if (!atDefault)
          verified = requireVerifiedAction(ctx, input.verification, 'pos.charge.manage');
        action = type.code === 'SERVICE' ? 'pos.charge.override' : 'pos.charge.add';
      }

      const adjustment: SaleAdjustment = {
        id: newId('adj'),
        kind: input.kind,
        scope: input.scope,
        ...(input.productId ? { productId: input.productId } : {}),
        mode,
        value,
        ...(input.promotionCode ? { promotionCode: input.promotionCode } : {}),
        ...(input.chargeCode ? { chargeCode: input.chargeCode } : {}),
        label,
        ...(previousValue !== undefined ? { previousValue } : {}),
        status: 'ACTIVE',
        reason: verified?.reason ?? null,
        approvedBy: verified
          ? { id: verified.employee.id, fullName: verified.employee.fullName }
          : null,
        createdBy: ctx.me.user.displayName,
        createdAt: nowIso(),
        locationId: location.id,
        deviceId: ctx.me.device?.id ?? null,
      };
      db.update((d) => {
        d.adjustments.push({ ...adjustment, tenantId: ctx.me.tenant.id });
      });
      const product =
        input.scope === 'LINE'
          ? db.get().products.find((p) => p.id === input.productId)?.name
          : null;
      recordAudit(ctx, {
        action,
        entity: 'sale-adjustment',
        entityId: adjustment.id,
        entityLabel: [
          previousValue !== undefined
            ? // A price change reads old → new, like the seeded history ("Milk Tea 120 → 110").
              `${product}: Price ${formatMoney({ amount: previousValue, currency })} → ${formatMoney({ amount: value, currency })}`
            : `${product ? `${product}: ` : input.kind === 'DISCOUNT' ? 'Bill: ' : ''}${label}`,
          ...(previousValue !== undefined ? [] : [describeValue(mode, value, currency)]),
          where(ctx),
        ].join(' · '),
        before:
          previousValue !== undefined ? { unitPrice: { amount: previousValue, currency } } : null,
        after:
          previousValue !== undefined ? { unitPrice: { amount: value, currency } } : adjustment,
        ...(verified ? { verified } : {}),
      });
      return HttpResponse.json(adjustment, { status: 201 });
    }),
  ),

  /** POS-006/007: open the cash drawer outside a sale (simulated kick), PIN + reason, audited. */
  http.post(
    `${API}/pos/drawer-events`,
    handle(async ({ request }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requireSeller(ctx);
      const input = await parseBody(request, drawerEventSchema);
      const verified = requireVerifiedAction(ctx, input.verification, 'pos.drawer.open');
      const id = newId('drw');
      recordAudit(ctx, {
        action: 'pos.drawer.open',
        entity: 'cash-drawer',
        entityId: ctx.me.device?.id ?? ctx.me.currentLocation!.id,
        entityLabel: ['Cash drawer opened', where(ctx)].filter(Boolean).join(' · '),
        before: null,
        after: { eventId: id },
        verified,
      });
      return HttpResponse.json({ id, openedAt: nowIso() }, { status: 201 });
    }),
  ),

  /** Remove a discount/charge from a sale: the record is voided and the change audited. */
  http.post(
    `${API}/pos/adjustments/:id/void`,
    handle(async ({ request, params }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requireSeller(ctx);
      const input = await parseBody(request, voidAdjustmentSchema);
      const existing = db
        .get()
        .adjustments.find((a) => a.id === params.id && a.tenantId === ctx.me.tenant.id);
      if (!existing) throw new MockHttpError('NOT_FOUND', 404, 'Adjustment not found');
      if (existing.status === 'VOIDED') {
        throw new MockHttpError('CONFLICT', 409, 'Already removed');
      }
      // Removing something that lowers what the customer pays needs a PIN; raising it doesn't:
      // a charge coming off → PIN; a discount coming off → none; a price change reverting
      // needs a PIN only if the catalog price is lower than the changed one.
      const lowersPrice =
        existing.kind === 'CHARGE' ||
        (existing.kind === 'PRICE' && (existing.previousValue ?? 0) < existing.value);
      const verified =
        lowersPrice && !input.system
          ? requireVerifiedAction(
              ctx,
              input.verification,
              existing.kind === 'PRICE' ? 'pos.price.override' : 'pos.charge.manage',
            )
          : undefined;
      const { tenantId: _tenantId, ...before } = existing;
      const after: SaleAdjustment = { ...before, status: 'VOIDED' };
      db.update((d) => {
        const row = d.adjustments.find((a) => a.id === existing.id);
        if (row) row.status = 'VOIDED';
      });
      recordAudit(ctx, {
        action: 'pos.adjustment.void',
        entity: 'sale-adjustment',
        entityId: existing.id,
        entityLabel: [
          `Removed ${existing.label}`,
          input.system === 'SALE_CLEARED' ? 'sale cleared' : null,
          where(ctx),
        ]
          .filter(Boolean)
          .join(' · '),
        before,
        after,
        ...(verified ? { verified } : {}),
      });
      return HttpResponse.json(after);
    }),
  ),
];
