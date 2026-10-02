import { z } from 'zod';

/** Reason codes that always require a free-text comment. */
export const COMMENT_REQUIRED_REASONS = ['OTHER'] as const;

/**
 * POS-007 mandatory reason for important changes (void, item cancel, discount, price change…).
 * Reasons are tenant-configurable; "Other" requires a comment.
 */
export const reasonSelectionSchema = z
  .object({
    reasonCode: z.string().min(1, { error: 'validation.reasonRequired' }),
    comment: z.string().trim().max(500, { error: 'validation.commentMax' }).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      (COMMENT_REQUIRED_REASONS as readonly string[]).includes(value.reasonCode) &&
      (value.comment ?? '').trim().length < 3
    ) {
      ctx.addIssue({ code: 'custom', path: ['comment'], message: 'validation.commentRequired' });
    }
  });

export type ReasonSelection = z.infer<typeof reasonSelectionSchema>;
