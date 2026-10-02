import {
  SENSITIVE_ACTIONS,
  type SensitiveActionCode,
  type SensitiveActionContext,
} from '@rbp/types';
import type { ReasonSelection } from '@rbp/validation';
import { useCallback } from 'react';
import { useReasonPromptStore } from '../store/reason-prompt-store';
import { useEmployeeVerification } from './use-employee-verification';

export interface SensitiveActionOptions {
  /** Reason dialog title, e.g. "Why this discount?" */
  reasonTitle: string;
  reasonDescription?: string;
  /** Shown in both dialogs, e.g. "Fish Bun ×4 · −LKR 50.00". */
  summary?: string;
  change?: { before: string; after: string };
}

/**
 * FLOW-POS-002: employee PIN (POS-006) → reason (POS-007), driven by the shared
 * SENSITIVE_ACTIONS policy. Resolves into the proof the API requires, or null if cancelled.
 *
 *   const confirm = useSensitiveAction();
 *   const verification = await confirm('pos.price.override', { reasonTitle, summary });
 *   if (verification) mutate({ ...body, verification });
 */
export function useSensitiveAction() {
  const verify = useEmployeeVerification();
  const openReason = useReasonPromptStore((s) => s.open);
  return useCallback(
    async (
      action: SensitiveActionCode,
      options: SensitiveActionOptions,
    ): Promise<SensitiveActionContext | null> => {
      // Every sensitive action needs a PIN; most also need a reason (see SENSITIVE_ACTIONS).
      const verification = await verify(action, options.summary);
      if (!verification) return null;
      if (!SENSITIVE_ACTIONS[action].reason) {
        return { verificationId: verification.verificationId, reasonCode: '' };
      }
      const reason = await new Promise<ReasonSelection | null>((resolve) =>
        openReason({
          action,
          title: options.reasonTitle,
          ...(options.reasonDescription ? { description: options.reasonDescription } : {}),
          ...(options.summary ? { summary: options.summary } : {}),
          ...(options.change ? { change: options.change } : {}),
          approvedBy: verification.employee.fullName,
          resolve,
        }),
      );
      if (!reason) return null;
      return {
        verificationId: verification.verificationId,
        reasonCode: reason.reasonCode,
        ...(reason.comment ? { reasonComment: reason.comment } : {}),
      };
    },
    [verify, openReason],
  );
}
