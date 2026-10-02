import { z } from 'zod';
import { moneySchema, sensitiveActionSchema } from './catalog';

const lineInputSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(999),
  note: z.string().trim().max(120, { error: 'validation.noteMax' }).optional(),
});

export const deliverySchema = z.object({
  address: z.string().trim().min(5, { error: 'validation.addressRequired' }).max(200),
  phone: z.string().trim().min(9, { error: 'validation.phoneInvalid' }).max(20),
  instructions: z.string().trim().max(200).optional(),
});

const orderTypeFields = {
  type: z.enum(['RETAIL', 'DINE_IN', 'TAKEAWAY', 'DELIVERY']).optional(),
  tableId: z.string().min(1).nullable().optional(),
  delivery: deliverySchema.nullable().optional(),
};

export const createOrderSchema = z.object({
  ...orderTypeFields,
  lines: z.array(lineInputSchema).min(1, { error: 'validation.required' }),
  customerId: z.string().min(1).nullable().optional(),
  adjustmentIds: z.array(z.string().min(1)),
  status: z.enum(['OPEN', 'HELD']),
  holdLabel: z.string().trim().max(40, { error: 'validation.nameMax' }).optional(),
});

export const updateOrderLinesSchema = z.object({
  ...orderTypeFields,
  lines: z.array(lineInputSchema),
  customerId: z.string().min(1).nullable().optional(),
  adjustmentIds: z.array(z.string().min(1)),
  status: z.enum(['OPEN', 'HELD']).optional(),
  holdLabel: z.string().trim().max(40, { error: 'validation.nameMax' }).optional(),
});

export const payOrderSchema = z.object({
  method: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'CREDIT']),
  tendered: moneySchema.optional(),
  reference: z.string().trim().max(40).optional(),
});

export const cancelItemSchema = z.object({
  quantity: z.number().int().min(1),
  verification: sensitiveActionSchema,
  disposition: z.enum(['NOT_PREPARED', 'RESALE', 'WASTAGE', 'STAFF_MEAL']).optional(),
});

export const transferTableSchema = z.object({
  toTableId: z.string().min(1),
  verification: sensitiveActionSchema,
});

export const deliveryStatusSchema = z.object({
  status: z.enum([
    'NEW',
    'CONFIRMED',
    'PREPARING',
    'READY',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'CANCELLED',
  ]),
  /** DEL-004 cash/card taken at the door when the order wasn't paid yet. */
  payment: z
    .object({ method: z.enum(['CASH', 'CARD']), tendered: moneySchema.optional() })
    .optional(),
});

/** DEL-003 */
export const deliveryAssignSchema = z.object({
  riderId: z.string().min(1, { error: 'validation.riderRequired' }),
});

export const orderApprovalSchema = z.object({ verification: sensitiveActionSchema });

export const cancelOrderSchema = orderApprovalSchema.extend({
  disposition: cancelItemSchema.shape.disposition,
});

export const createReturnSchema = z.object({
  lines: z
    .array(z.object({ lineId: z.string().min(1), quantity: z.number().int().min(1) }))
    .min(1, { error: 'validation.required' }),
  refundMethod: z.enum(['CASH', 'ORIGINAL']),
  restock: z.boolean().optional(),
  verification: sensitiveActionSchema,
});
