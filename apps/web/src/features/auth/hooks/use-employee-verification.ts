import type { EmployeeVerification, SensitiveActionCode } from '@rbp/types';
import { useCallback } from 'react';
import { usePinPromptStore } from '../store/pin-prompt-store';

/**
 * POS-006: ask the employee at the device to confirm a sensitive action with their PIN.
 * The server checks their permission for this action straight away and binds the
 * verification to it. Resolves with the verification, or null if cancelled.
 *
 *   const verify = useEmployeeVerification();
 *   const v = await verify('pos.discount.apply', '10% on the bill');
 */
export function useEmployeeVerification() {
  const open = usePinPromptStore((s) => s.open);
  return useCallback(
    (action: SensitiveActionCode, summary?: string) =>
      new Promise<EmployeeVerification | null>((resolve) =>
        open({ action, ...(summary ? { summary } : {}), resolve }),
      ),
    [open],
  );
}
