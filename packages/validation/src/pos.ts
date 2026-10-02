import { z } from 'zod';
import { sensitiveActionSchema } from './catalog';

/** POST /pos/adjustments (POS-004 discount / POS-005 charge). */
export const createAdjustmentSchema = z
  .object({
    kind: z.enum(['DISCOUNT', 'CHARGE', 'PRICE']),
    scope: z.enum(['ORDER', 'LINE']),
    productId: z.string().min(1).optional(),
    promotionCode: z.string().min(1).optional(),
    chargeCode: z.enum(['SERVICE', 'DELIVERY', 'PACKAGING', 'OTHER']).optional(),
    mode: z.enum(['PERCENT', 'FIXED']).optional(),
    value: z.number().int({ error: 'validation.priceMinorUnits' }).min(0).optional(),
    label: z.string().trim().max(40, { error: 'validation.nameMax' }).optional(),
    verification: sensitiveActionSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.scope === 'LINE' && !v.productId) {
      ctx.addIssue({ code: 'custom', path: ['productId'], message: 'validation.required' });
    }
    if (v.kind === 'CHARGE' && !v.chargeCode) {
      ctx.addIssue({ code: 'custom', path: ['chargeCode'], message: 'validation.required' });
    }
    if (!v.promotionCode && (v.mode === undefined || v.value === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'validation.amountRequired' });
    }
    if (v.mode === 'PERCENT' && v.value !== undefined && v.value > 10000) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'validation.percentMax' });
    }
    if (v.kind === 'DISCOUNT' && !v.promotionCode && v.value === 0) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'validation.amountRequired' });
    }
    if (v.kind === 'PRICE' && (v.scope !== 'LINE' || v.mode !== 'FIXED' || !v.value)) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'validation.priceRequired' });
    }
    if (v.chargeCode === 'OTHER' && !v.label) {
      ctx.addIssue({ code: 'custom', path: ['label'], message: 'validation.chargeLabelRequired' });
    }
  });
export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;

export const voidAdjustmentSchema = z.object({
  verification: sensitiveActionSchema.optional(),
  system: z.literal('SALE_CLEARED').optional(),
});

export const drawerEventSchema = z.object({ verification: sensitiveActionSchema });
