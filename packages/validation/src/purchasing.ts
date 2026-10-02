import { z } from 'zod';

/** PUR-001…004. Messages are i18n keys (validation namespace). */

const units = (min: number) =>
  z
    .number({ error: 'validation.quantityRequired' })
    .int({ error: 'validation.wholeUnits' })
    .min(min, { error: min > 0 ? 'validation.quantityPositive' : 'validation.quantityNotNegative' })
    .max(100_000);

const optionalText = (max: number) => z.string().trim().max(max).optional();

export const supplierSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: 'validation.nameMin' })
    .max(80, { error: 'validation.nameMax' }),
  contactName: optionalText(80),
  phone: optionalText(30),
  email: z
    .union([z.literal(''), z.email({ error: 'validation.email' })])
    .optional()
    .transform((v) => v || undefined),
  address: optionalText(200),
  paymentTermsDays: z
    .number({ error: 'validation.required' })
    .int({ error: 'validation.wholeUnits' })
    .min(0, { error: 'validation.quantityNotNegative' })
    .max(365),
  note: optionalText(500),
});
export type SupplierInput = z.input<typeof supplierSchema>;

/** Unit cost is in minor units (cents). Each item once. */
export const purchaseOrderSchema = z
  .object({
    supplierId: z.string().min(1, { error: 'validation.supplierRequired' }),
    locationId: z.string().min(1, { error: 'validation.required' }),
    expectedDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .or(z.literal('').transform(() => undefined)),
    note: optionalText(200),
    lines: z
      .array(
        z.object({
          productId: z.string().min(1, { error: 'validation.itemRequired' }),
          quantity: units(1),
          unitCost: z
            .number({ error: 'validation.required' })
            .int()
            .min(0, { error: 'validation.quantityNotNegative' })
            .max(100_000_000),
        }),
      )
      .min(1, { error: 'validation.purchaseOrderEmpty' }),
    place: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.lines.forEach((l, i) => {
      if (seen.has(l.productId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'validation.itemOnOrder',
          path: ['lines', i, 'productId'],
        });
      }
      seen.add(l.productId);
    });
  });
export type PurchaseOrderInput = z.input<typeof purchaseOrderSchema>;

export const receiveGoodsSchema = z
  .object({
    lines: z.array(z.object({ productId: z.string().min(1), receivedQuantity: units(0) })),
    supplierInvoiceRef: optionalText(40),
    note: optionalText(200),
  })
  .superRefine((v, ctx) => {
    if (!v.lines.some((l) => l.receivedQuantity > 0)) {
      ctx.addIssue({ code: 'custom', message: 'validation.receiveNothing', path: ['lines'] });
    }
  });
export type ReceiveGoodsInput = z.input<typeof receiveGoodsSchema>;

export const cancelPurchaseOrderSchema = z.object({
  reason: z.string().trim().min(3, { error: 'validation.cancelReasonRequired' }).max(200),
});
