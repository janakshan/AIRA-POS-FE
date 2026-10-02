import { z } from 'zod';
import { sensitiveActionSchema } from './catalog';
import { customerPhonesSchema } from './customer';

/** WHO-001…006. Messages are i18n keys (validation namespace). */

const units = (min: number) =>
  z
    .number({ error: 'validation.quantityRequired' })
    .int({ error: 'validation.wholeUnits' })
    .min(min, { error: min > 0 ? 'validation.quantityPositive' : 'validation.quantityNotNegative' })
    .max(100_000);

/** Minor units. */
const amount = (min: number) =>
  z
    .number({ error: 'validation.amountRequired' })
    .int()
    .min(min, { error: min > 0 ? 'validation.amountPositive' : 'validation.quantityNotNegative' })
    .max(100_000_000);

const optionalText = (max: number) => z.string().trim().max(max).optional();

const method = z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE']);

/** WHO-001/002 shop record (§25). */
export const wholesaleShopSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: 'validation.nameMin' })
    .max(80, { error: 'validation.nameMax' }),
  ownerName: optionalText(80),
  phones: customerPhonesSchema,
  address: optionalText(200),
  area: optionalText(60),
  routeId: z.string().min(1).nullable().optional(),
  creditLimit: amount(0),
  paymentTermsDays: z.number().int().min(0).max(120),
  notes: optionalText(500),
  isActive: z.boolean().optional(),
});
export type WholesaleShopInput = z.input<typeof wholesaleShopSchema>;

/** WHO-003: each product once; cash now can't exceed the invoice (checked server-side). */
export const wholesaleInvoiceSchema = z
  .object({
    shopId: z.string().min(1, { error: 'validation.shopRequired' }),
    locationId: z.string().min(1).optional(),
    lines: z
      .array(z.object({ productId: z.string().min(1), quantity: units(1) }))
      .min(1, { error: 'validation.invoiceEmpty' }),
    paidNow: amount(0),
    method: method.optional(),
    note: optionalText(200),
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
    if (v.paidNow > 0 && !v.method) {
      ctx.addIssue({ code: 'custom', message: 'validation.methodRequired', path: ['method'] });
    }
  });

/** A-310: a product's wholesale price, minor units, VAT inclusive. */
export const wholesalePriceSchema = z.object({ price: amount(1) });
export type WholesalePriceInput = z.input<typeof wholesalePriceSchema>;

/** A-311: void an invoice with a manager PIN + reason. */
export const voidWholesaleInvoiceSchema = z.object({ verification: sensitiveActionSchema });

export const shareInvoiceSchema = z.object({ channel: z.enum(['SHARE', 'WHATSAPP', 'COPY']) });

/** WHO-004 */
export const wholesaleCollectionSchema = z.object({
  shopId: z.string().min(1, { error: 'validation.shopRequired' }),
  amount: amount(1),
  method,
  reference: optionalText(40),
  note: optionalText(200),
});

/** WHO-005: each product once per condition; PIN + reason. */
export const wholesaleReturnSchema = z
  .object({
    shopId: z.string().min(1, { error: 'validation.shopRequired' }),
    invoiceId: z.string().min(1).optional(),
    lines: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantity: units(1),
          condition: z.enum(['GOOD', 'DAMAGED', 'EXPIRED', 'WASTAGE']),
        }),
      )
      .min(1, { error: 'validation.returnEmpty' }),
    verification: sensitiveActionSchema,
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.lines.forEach((l, i) => {
      const key = `${l.productId}:${l.condition}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          message: 'validation.lineTwice',
          path: ['lines', i, 'productId'],
        });
      }
      seen.add(key);
    });
  });
