import { describe, expect, it } from 'vitest';
import { reasonSelectionSchema } from './reason';

describe('reasonSelectionSchema', () => {
  it('requires a reason', () => {
    const r = reasonSelectionSchema.safeParse({ reasonCode: '' });
    expect(r.error?.issues[0]?.message).toBe('validation.reasonRequired');
  });

  it('accepts a configured reason without comment', () => {
    expect(reasonSelectionSchema.safeParse({ reasonCode: 'WRONG_ITEM' }).success).toBe(true);
  });

  it('requires a comment for OTHER', () => {
    const r = reasonSelectionSchema.safeParse({ reasonCode: 'OTHER', comment: ' ' });
    expect(r.error?.issues[0]).toMatchObject({
      path: ['comment'],
      message: 'validation.commentRequired',
    });
    expect(
      reasonSelectionSchema.safeParse({ reasonCode: 'OTHER', comment: 'Manager asked' }).success,
    ).toBe(true);
  });
});
