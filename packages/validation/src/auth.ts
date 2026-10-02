import { z } from 'zod';

/**
 * Messages are i18n keys (resolved by the UI), so the same schemas can be
 * reused by the backend and localised on the client.
 */
export const loginSchema = z.object({
  email: z.email({ error: 'validation.email' }),
  password: z.string().min(6, { error: 'validation.passwordMin' }),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const PIN_LENGTH = 4;

export const employeePinSchema = z.object({
  pin: z
    .string()
    .length(PIN_LENGTH, { error: 'validation.pinLength' })
    .regex(/^\d+$/, { error: 'validation.pinDigits' }),
});
export type EmployeePinInput = z.infer<typeof employeePinSchema>;

export const locationSelectSchema = z.object({
  locationId: z.string().min(1, { error: 'validation.locationRequired' }),
});
export type LocationSelectInput = z.infer<typeof locationSelectSchema>;
