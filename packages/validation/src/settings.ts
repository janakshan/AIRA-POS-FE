import { PERMISSIONS } from '@rbp/types';
import { z } from 'zod';

/** SET-002/003/004/007. Messages are i18n keys (common:validation). */

const bps = z
  .number({ error: 'validation.amountRequired' })
  .int()
  .min(0, { error: 'validation.quantityNotNegative' })
  .max(10_000, { error: 'validation.percentMax' });

/** SET-007: the rules A-213 relies on at the POS. */
export const chargeSettingSchema = z
  .object({
    code: z.enum(['SERVICE', 'DELIVERY', 'PACKAGING', 'OTHER']),
    offered: z.boolean(),
    name: z.string().trim().min(2, { error: 'validation.nameMin' }).max(40),
    mode: z.enum(['PERCENT', 'FIXED']),
    defaultValue: z.number().int().min(0).max(100_000_000).nullable(),
    automatic: z.boolean(),
  })
  .superRefine((c, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', message, path: [path] });
    if (c.code === 'SERVICE' && c.mode !== 'PERCENT') issue('mode', 'validation.servicePercent');
    if (c.mode === 'PERCENT' && (c.defaultValue ?? 0) > 10_000)
      issue('defaultValue', 'validation.percentMax');
    if (c.code !== 'SERVICE' && c.automatic) issue('automatic', 'validation.onlyServiceAutomatic');
    if (c.code === 'OTHER' && c.defaultValue !== null)
      issue('defaultValue', 'validation.otherNoDefault');
    if (c.code !== 'OTHER' && c.offered && !c.defaultValue)
      issue('defaultValue', 'validation.chargeDefaultRequired');
  });

export const chargeSettingsSchema = z
  .object({ charges: z.array(chargeSettingSchema) })
  .superRefine((v, ctx) => {
    const codes = v.charges.map((c) => c.code);
    if (new Set(codes).size !== codes.length)
      ctx.addIssue({ code: 'custom', message: 'validation.itemTwice', path: ['charges'] });
  });

/** SET-002 */
export const locationPosSchema = z.object({
  taxLabel: z.string().trim().min(1, { error: 'validation.required' }).max(12),
  taxRateBps: bps,
  maxDiscountBps: bps,
  returnWindowDays: z
    .number({ error: 'validation.quantityRequired' })
    .int()
    .min(0, { error: 'validation.quantityNotNegative' })
    .max(365, { error: 'validation.daysMax' }),
  receiptFooter: z.string().trim().max(120, { error: 'validation.noteMax' }),
});

export const locationSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, { error: 'validation.codeRequired' })
    .max(8, { error: 'validation.codeMax' })
    .regex(/^[A-Za-z0-9_-]+$/, { error: 'validation.codeFormat' })
    .transform((v) => v.toUpperCase()),
  name: z
    .string()
    .trim()
    .min(2, { error: 'validation.nameMin' })
    .max(60, { error: 'validation.nameMax' }),
  type: z.enum(['RESTAURANT', 'RETAIL', 'BAKERY', 'WAREHOUSE', 'MIXED', 'VAN']),
  address: z.string().trim().min(3, { error: 'validation.addressRequired' }).max(160),
  isActive: z.boolean().optional(),
  pos: locationPosSchema,
});
export type LocationInput = z.input<typeof locationSchema>;

/** SET-003 */
const password = z.string().min(8, { error: 'validation.passwordMin8' }).max(64);

export const userSchema = z.object({
  email: z.email({ error: 'validation.email' }).transform((v) => v.trim().toLowerCase()),
  displayName: z
    .string()
    .trim()
    .min(2, { error: 'validation.nameMin' })
    .max(60, { error: 'validation.nameMax' }),
  roleIds: z.array(z.string().min(1)).min(1, { error: 'validation.rolesRequired' }),
  /** Empty = all locations. */
  locationIds: z.array(z.string().min(1)),
  employeeId: z.string().min(1).nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
export const userCreateSchema = userSchema.extend({ password });
export const passwordResetSchema = z.object({ password });

/** SET-004 */
export const roleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: 'validation.nameMin' })
    .max(40, { error: 'validation.nameMax' }),
  permissions: z
    .array(z.enum(PERMISSIONS))
    .min(1, { error: 'validation.permissionsRequired' })
    .transform((p) => [...new Set(p)]),
});

/** SET-001 */
export const businessSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: 'validation.nameMin' })
    .max(60, { error: 'validation.nameMax' }),
  logoText: z
    .string()
    .trim()
    .min(1, { error: 'validation.required' })
    .max(3, { error: 'validation.logoTextMax' }),
  primaryColor: z.string().trim().max(60).nullable(),
  phone: z.string().trim().max(30),
  taxRegNo: z.string().trim().max(30),
  timezone: z.string().min(1, { error: 'validation.required' }),
});

/** SET-005 */
export const deviceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: 'validation.nameMin' })
    .max(40, { error: 'validation.nameMax' }),
  type: z.enum(['POS_TERMINAL', 'TABLET', 'KITCHEN_DISPLAY', 'BACK_OFFICE']),
  locationId: z.string().min(1, { error: 'validation.locationRequired' }),
  isActive: z.boolean().optional(),
});

/** SET-006 */
export const paymentSettingsSchema = z.object({
  methods: z.array(
    z.object({
      method: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'CREDIT']),
      enabled: z.boolean(),
    }),
  ),
});

/** SET-008 */
export const printerNameSchema = z.object({
  receiptPrinter: z.string().trim().min(2, { error: 'validation.nameMin' }).max(40),
});

export const stationSchema = z.object({
  locationId: z.string().min(1, { error: 'validation.locationRequired' }),
  code: z
    .string()
    .trim()
    .min(2, { error: 'validation.codeRequired' })
    .max(6, { error: 'validation.codeMax' })
    .regex(/^[A-Za-z0-9_-]+$/, { error: 'validation.codeFormat' })
    .transform((v) => v.toUpperCase()),
  name: z
    .string()
    .trim()
    .min(2, { error: 'validation.nameMin' })
    .max(40, { error: 'validation.nameMax' }),
  printerName: z.string().trim().min(2, { error: 'validation.nameMin' }).max(40),
});

/** SET-009: English is always on and the default must be one of the enabled languages. */
export const languageSettingsSchema = z
  .object({
    defaultLanguage: z.enum(['en', 'ta', 'si']),
    languages: z.array(z.enum(['en', 'ta', 'si'])),
  })
  .transform((v) => ({
    ...v,
    languages: (['en', 'ta', 'si'] as const).filter((l) => l === 'en' || v.languages.includes(l)),
  }))
  .superRefine((v, ctx) => {
    if (!v.languages.includes(v.defaultLanguage)) {
      ctx.addIssue({
        code: 'custom',
        message: 'validation.defaultLanguageOff',
        path: ['defaultLanguage'],
      });
    }
  });
