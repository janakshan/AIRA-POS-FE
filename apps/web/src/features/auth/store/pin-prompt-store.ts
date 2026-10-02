import type { EmployeeVerification, SensitiveActionCode } from '@rbp/types';
import { create } from 'zustand';

interface PinPrompt {
  /** Sensitive action being authorised (SENSITIVE_ACTIONS); recorded for audit. */
  action: SensitiveActionCode;
  /** What is about to change, e.g. "10% on the bill · −LKR 354.00". */
  summary?: string;
  resolve: (result: EmployeeVerification | null) => void;
}

interface PinPromptState {
  prompt: PinPrompt | null;
  open: (prompt: PinPrompt) => void;
  close: () => void;
}

export const usePinPromptStore = create<PinPromptState>()((set) => ({
  prompt: null,
  open: (prompt) => set({ prompt }),
  close: () => set({ prompt: null }),
}));
