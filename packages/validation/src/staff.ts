import { normalizePhone } from '@rbp/utils';
import { z } from 'zod';
import { sensitiveActionSchema } from './catalog';

/** HR-001…006. Messages are i18n keys (validation namespace). */

const pin = z.string().regex(/^\d{4}$/, { error: 'validation.pinFormat' });
const minor = (min: number) =>
  z
    .number({ error: 'validation.amountRequired' })
    .int()
    .min(min, { error: 'validation.quantityNotNegative' })
    .max(100_000_000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'validation.dateRequired' });

/** HR-001 add / edit. */
export const employeeSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, { error: 'validation.nameMin' })
    .max(80, { error: 'validation.nameMax' }),
  jobTitle: z.string().trim().min(2, { error: 'validation.required' }).max(40),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((value, ctx) => {
      if (!value) return undefined;
      const e164 = normalizePhone(value);
      if (!e164) {
        ctx.addIssue({ code: 'custom', message: 'validation.phoneInvalid' });
        return z.NEVER;
      }
      return e164;
    }),
  locationIds: z.array(z.string().min(1)).min(1, { error: 'validation.locationsRequired' }),
  pin: pin.optional(),
  monthlyFoodAllowance: minor(0),
  isActive: z.boolean().optional(),
});
export type EmployeeInput = z.input<typeof employeeSchema>;

/** HR-003 */
export const clockSchema = z.object({ pin, locationId: z.string().min(1).optional() });

/** HR-004 roster cell. */
export const rosterAssignSchema = z.object({
  locationId: z.string().min(1),
  employeeId: z.string().min(1),
  date,
  templateId: z.string().min(1).nullable(),
});

/** HR-004 cash drawer. */
export const openCashShiftSchema = z.object({ pin, openingFloat: minor(0) });
export const cashShiftEventSchema = z.object({
  type: z.enum(['CASH_IN', 'CASH_OUT']),
  amount: minor(1),
  note: z.string().trim().min(3, { error: 'validation.noteRequired' }).max(120),
});
export const closeCashShiftSchema = z.object({
  pin,
  countedCash: minor(0),
  note: z.string().trim().max(200).optional(),
});

/** A-312: void a staff meal (same day) with a manager PIN and reason. */
export const staffMealVoidSchema = z.object({ verification: sensitiveActionSchema });

/** HR-005 / POS: each item once. */
export const staffMealSchema = z
  .object({
    employeeId: z.string().min(1, { error: 'validation.employeeRequired' }),
    locationId: z.string().min(1).optional(),
    lines: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantity: z.number().int().min(1, { error: 'validation.quantityPositive' }).max(50),
        }),
      )
      .min(1, { error: 'validation.mealEmpty' }),
    source: z.enum(['HR', 'POS']).optional(),
    verification: sensitiveActionSchema,
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.lines.forEach((l, i) => {
      if (seen.has(l.productId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'validation.lineTwice',
          path: ['lines', i, 'productId'],
        });
      }
      seen.add(l.productId);
    });
  });
