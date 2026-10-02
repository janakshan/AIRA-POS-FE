import type { CurrencyCode, Money } from '@rbp/types';
import { z } from 'zod';

/**
 * Catalog request schemas (CAT-002 Category Form, CAT-004 Product Form).
 * Shared by forms on the client and request validation in the API (MSW now, NestJS later).
 * Messages are i18n keys.
 */
const CURRENCIES = ['LKR', 'USD', 'INR'] as const satisfies readonly CurrencyCode[];

export const moneySchema = z.object({
  amount: z
    .number({ error: 'validation.priceRequired' })
    .int({ error: 'validation.priceMinorUnits' })
    .positive({ error: 'validation.pricePositive' }),
  currency: z.enum(CURRENCIES),
}) satisfies z.ZodType<Money>;

const codeSchema = z
  .string()
  .trim()
  .min(1, { error: 'validation.codeRequired' })
  .max(20, { error: 'validation.codeMax' })
  .regex(/^[A-Za-z0-9_-]+$/, { error: 'validation.codeFormat' });

const nameSchema = z
  .string()
  .trim()
  .min(2, { error: 'validation.nameMin' })
  .max(80, { error: 'validation.nameMax' });

/** Optional Tamil / Sinhala names; blanks are dropped. */
export const nameTranslationsSchema = z.object({
  ta: z.string().trim().max(80, { error: 'validation.nameMax' }).optional(),
  si: z.string().trim().max(80, { error: 'validation.nameMax' }).optional(),
});

/** ~200 KB cap keeps downscaled button images small (they're sent with every catalog read). */
export const MAX_IMAGE_URL_LENGTH = 200_000;
export const imageUrlSchema = z
  .string()
  .max(MAX_IMAGE_URL_LENGTH, { error: 'validation.imageTooLarge' })
  .regex(/^(data:image\/(png|jpeg|webp);base64,|https:\/\/)/, { error: 'validation.imageFormat' })
  .nullable();

export const categoryInputSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  nameTranslations: nameTranslationsSchema.optional(),
  color: z.string().trim().min(1, { error: 'validation.colorRequired' }),
  imageUrl: imageUrlSchema.optional(),
  parentId: z.string().min(1).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

/** PATCH /categories/:id — every field optional. */
export const categoryUpdateSchema = categoryInputSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;

export const productInputSchema = z.object({
  categoryId: z.string().min(1, { error: 'validation.categoryRequired' }),
  code: codeSchema,
  name: nameSchema,
  nameTranslations: nameTranslationsSchema.optional(),
  description: z.string().max(200, { error: 'validation.descriptionMax' }).optional(),
  imageUrl: imageUrlSchema.optional(),
  basePrice: moneySchema,
  taxMode: z.enum(['INCLUSIVE', 'EXCLUSIVE']),
  barcodes: z
    .array(z.string().trim().min(1))
    .refine((codes) => new Set(codes).size === codes.length, {
      error: 'validation.barcodeDuplicate',
    })
    .optional(),
  showOnQuickPad: z.boolean().optional(),
});
export type ProductInput = z.infer<typeof productInputSchema>;

/** PATCH /products/:id — every field optional. */
export const productUpdateSchema = productInputSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

/**
 * Flatten zod issues into `{ fieldPath: i18nKey }` — the `details.fieldErrors`
 * shape of a 400 VALIDATION_FAILED response.
 */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_';
    out[path] ??= issue.message;
  }
  return out;
}

/** PUT /location-products/:productId (CAT-005). */
export const locationProductUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
  stockNote: z.string().trim().max(40, { error: 'validation.stockNoteMax' }).nullable().optional(),
  stationId: z.string().min(1).nullable().optional(),
  serviceCharge: z.boolean().optional(),
});

/** Proof of PIN verification + reason attached to sensitive writes. */
export const sensitiveActionSchema = z.object({
  verificationId: z.string().min(1),
  reasonCode: z.string().min(1, { error: 'validation.reasonRequired' }),
  reasonComment: z.string().trim().max(500, { error: 'validation.commentMax' }).optional(),
});

/** PUT /price-matrix (CAT-006). */
export const updatePricesSchema = z
  .object({
    changes: z
      .array(
        z.object({
          productId: z.string().min(1),
          locationId: z.string().min(1).nullable(),
          price: moneySchema.nullable(),
        }),
      )
      .min(1)
      .max(500),
    verification: sensitiveActionSchema.optional(),
  })
  .superRefine((value, ctx) => {
    value.changes.forEach((change, i) => {
      if (change.locationId === null && change.price === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['changes', i, 'price'],
          message: 'validation.priceRequired',
        });
      }
    });
  });

/** PUT /quick-pad-layout (CAT-007). */
export const quickPadLayoutSchema = z.object({
  categoryOrder: z.array(z.string().min(1)),
  categoryColors: z.record(z.string(), z.string().min(1)),
  productOrder: z.record(z.string(), z.array(z.string().min(1))),
});
