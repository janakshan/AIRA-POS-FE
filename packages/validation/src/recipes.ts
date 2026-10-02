import { z } from 'zod';

/** REC-001…005. Messages are i18n keys (validation namespace). */

const units = (min: number) =>
  z
    .number({ error: 'validation.quantityRequired' })
    .int({ error: 'validation.wholeUnits' })
    .min(min, { error: min > 0 ? 'validation.quantityPositive' : 'validation.quantityNotNegative' })
    .max(100_000);

export const portionSchema = z.object({
  description: z.string().trim().min(1, { error: 'validation.required' }).max(80),
  grams: z.number().int().min(1).max(100_000).optional(),
  perPack: z.number().int().min(1).max(10_000).optional(),
});

export const ingredientSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, { error: 'validation.required' })
    .max(20)
    .transform((v) => v.toUpperCase()),
  name: z
    .string()
    .trim()
    .min(2, { error: 'validation.nameMin' })
    .max(60, { error: 'validation.nameMax' }),
  unit: z.enum(['pcs', 'portion', 'pack']),
  portion: portionSchema.nullable().optional(),
  minStock: units(0).optional(),
  locationId: z.string().min(1).optional(),
});
export type IngredientInput = z.input<typeof ingredientSchema>;

/** One serving: each ingredient once, whole units. */
export const recipeSchema = z
  .object({
    lines: z
      .array(
        z.object({
          ingredientId: z.string().min(1, { error: 'validation.itemRequired' }),
          quantity: units(1),
        }),
      )
      .min(1, { error: 'validation.recipeEmpty' }),
    isActive: z.boolean(),
    note: z.string().trim().max(200).optional(),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.lines.forEach((l, i) => {
      if (seen.has(l.ingredientId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'validation.ingredientTwice',
          path: ['lines', i, 'ingredientId'],
        });
      }
      seen.add(l.ingredientId);
    });
  });
export type RecipeInput = z.input<typeof recipeSchema>;

export const preparedItemSchema = z.object({
  productId: z.string().min(1, { error: 'validation.itemRequired' }),
  quantity: units(1).max(100),
  shelfLifeHours: z.number().int().min(1).max(48).optional(),
  note: z.string().trim().max(120).optional(),
});

export const disposePreparedSchema = z.object({
  outcome: z.enum(['WASTAGE', 'STAFF_MEAL', 'DISPOSED', 'OTHER']),
  reason: z.string().trim().min(3, { error: 'validation.disposeReasonRequired' }).max(200),
});
