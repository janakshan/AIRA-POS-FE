import type { SensitiveActionCode } from '@rbp/types';
import type { ReasonSelection } from '@rbp/validation';
import { create } from 'zustand';

export interface ReasonPrompt {
  action: SensitiveActionCode;
  title: string;
  description?: string;
  summary?: string;
  /** Before → after for the change, when meaningful (prices, quantities). */
  change?: { before: string; after: string };
  /** Employee whose PIN approved this step. */
  approvedBy?: string;
  resolve: (result: ReasonSelection | null) => void;
}

interface ReasonPromptState {
  prompt: ReasonPrompt | null;
  open: (prompt: ReasonPrompt) => void;
  close: () => void;
}

export const useReasonPromptStore = create<ReasonPromptState>()((set) => ({
  prompt: null,
  open: (prompt) => set({ prompt }),
  close: () => set({ prompt: null }),
}));
