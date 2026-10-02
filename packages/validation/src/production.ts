import { z } from 'zod';
import { sensitiveActionSchema } from './catalog';

/** BAK-001…005. Messages are i18n keys (validation namespace). */

const units = (min: number) =>
  z
    .number({ error: 'validation.quantityRequired' })
    .int({ error: 'validation.wholeUnits' })
    .min(min, { error: min > 0 ? 'validation.quantityPositive' : 'validation.quantityNotNegative' })
    .max(100_000);

const planDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'validation.dateRequired' });

/** BAK-002: each product once; 0 planned lines are dropped by the client. */
export const productionPlanSchema = z
  .object({
    locationId: z.string().min(1),
    planDate,
    note: z.string().trim().max(200).optional(),
    lines: z
      .array(
        z.object({
          productId: z.string().min(1, { error: 'validation.itemRequired' }),
          plannedQuantity: units(1),
        }),
      )
      .min(1, { error: 'validation.planEmpty' }),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.lines.forEach((l, i) => {
      if (seen.has(l.productId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'validation.productTwice',
          path: ['lines', i, 'productId'],
        });
      }
      seen.add(l.productId);
    });
  });
export type ProductionPlanInput = z.input<typeof productionPlanSchema>;

/** A-309 formula: yield ≥ 1 whole unit; at least one raw material, each once, ≥ 1 whole unit. */
export const productionFormulaSchema = z
  .object({
    yieldQuantity: units(1),
    lines: z
      .array(
        z.object({
          ingredientId: z.string().min(1, { error: 'validation.itemRequired' }),
          quantity: units(1),
        }),
      )
      .min(1, { error: 'validation.formulaEmpty' }),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.lines.forEach((l, i) => {
      if (seen.has(l.ingredientId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'validation.materialTwice',
          path: ['lines', i, 'ingredientId'],
        });
      }
      seen.add(l.ingredientId);
    });
  });
export type ProductionFormulaInput = z.input<typeof productionFormulaSchema>;

export const cancelProductionSchema = z.object({
  reason: z.string().trim().min(3, { error: 'validation.productionCancelReasonRequired' }).max(200),
});

/** BAK-003 start: actual raw materials used (0 allowed, e.g. an ingredient left out). */
export const startBatchSchema = z.object({
  consumption: z
    .array(z.object({ ingredientId: z.string().min(1), quantity: units(0) }))
    .optional(),
  note: z.string().trim().max(200).optional(),
});

/** BAK-003 record output: rejects need a reason. */
export const completeBatchSchema = z
  .object({
    goodQuantity: units(0),
    rejectedQuantity: units(0),
    rejectReasonCode: z.string().min(1).optional(),
    rejectComment: z.string().trim().max(200).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.goodQuantity + v.rejectedQuantity < 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'validation.outputRequired',
        path: ['goodQuantity'],
      });
    }
    if (v.rejectedQuantity > 0 && !v.rejectReasonCode) {
      ctx.addIssue({
        code: 'custom',
        message: 'validation.reasonRequired',
        path: ['rejectReasonCode'],
      });
    }
  });

/** BAK-004/005 write off finished goods (PIN + reason). */
export const productionWastageSchema = z.object({
  locationId: z.string().min(1),
  productId: z.string().min(1, { error: 'validation.itemRequired' }),
  quantity: units(1),
  note: z.string().trim().max(200).optional(),
  verification: sensitiveActionSchema,
});
