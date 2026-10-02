import { describe, expect, it } from 'vitest';
import { employeePinSchema, loginSchema } from './auth';

describe('auth schemas', () => {
  it('validates login', () => {
    expect(loginSchema.safeParse({ email: 'a@b.lk', password: 'secret1' }).success).toBe(true);
    const bad = loginSchema.safeParse({ email: 'nope', password: '1' });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues.map((i) => i.message)).toEqual([
      'validation.email',
      'validation.passwordMin',
    ]);
  });

  it('requires a 4 digit PIN', () => {
    expect(employeePinSchema.safeParse({ pin: '1234' }).success).toBe(true);
    expect(employeePinSchema.safeParse({ pin: '12a4' }).success).toBe(false);
    expect(employeePinSchema.safeParse({ pin: '123' }).success).toBe(false);
  });
});
