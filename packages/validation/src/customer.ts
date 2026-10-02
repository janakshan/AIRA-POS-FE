import { normalizePhone } from '@rbp/utils';
import { z } from 'zod';

/** Phone in any common Sri Lankan / E.164 format; transforms to E.164. */
export const phoneSchema = z
  .string()
  .trim()
  .min(1, { error: 'validation.phoneRequired' })
  .transform((value, ctx) => {
    const e164 = normalizePhone(value);
    if (!e164) {
      ctx.addIssue({ code: 'custom', message: 'validation.phoneInvalid' });
      return z.NEVER;
    }
    return e164;
  });

export const customerTypeSchema = z.enum(['RETAIL', 'REGULAR', 'CORPORATE']);

/** POS-003 quick create (REQ-415…419). */
export const quickCustomerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: 'validation.nameMin' })
    .max(80, { error: 'validation.nameMax' }),
  phone: phoneSchema,
  type: customerTypeSchema.optional(),
  address: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
});
export type QuickCustomerInput = z.input<typeof quickCustomerSchema>;

const optionalText = (max: number) => z.string().trim().max(max).optional();

const phoneEntrySchema = z.object({
  number: phoneSchema,
  label: z.string().trim().max(20).optional(),
  primary: z.boolean(),
});

export const MAX_CUSTOMER_PHONES = 5;

/** CUS-002: one or more numbers, exactly one primary, no number twice. */
export const customerPhonesSchema = z
  .array(phoneEntrySchema)
  .min(1, { error: 'validation.phoneRequired' })
  .max(MAX_CUSTOMER_PHONES, { error: 'validation.phonesMax' })
  .superRefine((phones, ctx) => {
    if (phones.filter((p) => p.primary).length !== 1) {
      ctx.addIssue({ code: 'custom', message: 'validation.onePrimary', path: [] });
    }
    const seen = new Set<string>();
    phones.forEach((p, i) => {
      if (seen.has(p.number)) {
        ctx.addIssue({
          code: 'custom',
          message: 'validation.phoneDuplicate',
          path: [i, 'number'],
        });
      }
      seen.add(p.number);
    });
  });

/** CUS-002 full customer form (REQ-399…414). */
export const customerFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: 'validation.nameMin' })
    .max(80, { error: 'validation.nameMax' }),
  type: customerTypeSchema,
  phones: customerPhonesSchema,
  address: optionalText(200),
  deliveryAddress: optionalText(200),
  notes: optionalText(500),
});
export type CustomerFormInput = z.input<typeof customerFormSchema>;
export type CustomerFormValues = z.output<typeof customerFormSchema>;

/** PATCH: any subset of the form; `phone` alone (legacy quick edit) makes it primary. */
export const customerUpdateSchema = customerFormSchema.partial().extend({
  phone: phoneSchema.optional(),
});

/** CUS-005 money received against the customer's account. */
export const receiveCustomerPaymentSchema = z
  .object({
    amount: z.object({
      amount: z.number().int().positive({ error: 'validation.amountPositive' }),
      currency: z.string().length(3),
    }),
    method: z.enum(['CASH', 'CARD', 'BANK_TRANSFER']),
    reference: z.string().trim().max(40).optional(),
    note: z.string().trim().max(200).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.method === 'BANK_TRANSFER' && !v.reference) {
      ctx.addIssue({
        code: 'custom',
        message: 'validation.referenceRequired',
        path: ['reference'],
      });
    }
  });
