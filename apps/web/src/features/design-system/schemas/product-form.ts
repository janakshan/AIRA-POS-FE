import type { Money } from '@rbp/types';
import { z } from 'zod';

/** Example form schema for the UI Kit (mirrors what CAT-004 Product Form will need). */
export const productFormSchema = z.object({
  name: z.string().trim().min(2, { error: 'designSystem:forms.errors.name' }),
  categoryId: z.string().min(1, { error: 'designSystem:forms.errors.category' }),
  price: z
    .custom<Money | null>()
    .refine((m) => !!m && m.amount > 0, { error: 'designSystem:forms.errors.price' }),
  openingStock: z.number().int().min(0).nullable(),
  description: z.string().max(200).optional(),
  taxMode: z.enum(['INCLUSIVE', 'EXCLUSIVE']),
  active: z.boolean(),
  showOnQuickPad: z.boolean(),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;
