import { z } from 'zod';
import { sensitiveActionSchema } from './catalog';

const units = (min: number) =>
  z
    .number({ error: 'validation.quantityRequired' })
    .int({ error: 'validation.wholeUnits' })
    .min(min, { error: min > 0 ? 'validation.quantityPositive' : 'validation.quantityNotNegative' })
    .max(100_000);

/** INV-004: COUNT is the counted quantity (may be 0); the others move at least one unit. */
export const stockAdjustmentSchema = z
  .object({
    locationId: z.string().min(1),
    productId: z.string().min(1, { error: 'validation.itemRequired' }),
    kind: z.enum(['COUNT', 'ADD', 'REMOVE', 'WASTAGE', 'STAFF_MEAL']),
    quantity: units(0),
    note: z.string().trim().max(200).optional(),
    verification: sensitiveActionSchema,
  })
  .superRefine((v, ctx) => {
    if (v.kind !== 'COUNT' && v.quantity < 1) {
      ctx.addIssue({ code: 'custom', message: 'validation.quantityPositive', path: ['quantity'] });
    }
  });

export const minStockSchema = z.object({ minStock: units(0) });

/** INV-005 dispatch: two different locations, each item once. */
export const stockTransferSchema = z
  .object({
    fromLocationId: z.string().min(1),
    toLocationId: z.string().min(1),
    lines: z
      .array(z.object({ productId: z.string().min(1), quantity: units(1) }))
      .min(1, { error: 'validation.transferEmpty' }),
    note: z.string().trim().max(200).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.fromLocationId === v.toLocationId) {
      ctx.addIssue({ code: 'custom', message: 'validation.sameLocation', path: ['toLocationId'] });
    }
    const seen = new Set<string>();
    v.lines.forEach((l, i) => {
      if (seen.has(l.productId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'validation.itemTwice',
          path: ['lines', i, 'productId'],
        });
      }
      seen.add(l.productId);
    });
  });

export const receiveTransferSchema = z.object({
  lines: z.array(z.object({ productId: z.string().min(1), receivedQuantity: units(0) })),
});
