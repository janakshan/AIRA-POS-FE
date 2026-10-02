import type { PreparedDisposition } from '@rbp/types';
import { create } from 'zustand';

/** SCN-004: what happens to food the kitchen already has when it's cancelled. */
export interface DispositionPrompt {
  name: string;
  quantity: number;
  /** 'order' = cancelling the whole order: `name` is the order, `quantity` all units sent. */
  scope: 'item' | 'order';
  resolve: (result: PreparedDisposition | null) => void;
}

interface DispositionPromptState {
  prompt: DispositionPrompt | null;
  ask: (
    name: string,
    quantity: number,
    scope?: DispositionPrompt['scope'],
  ) => Promise<PreparedDisposition | null>;
  settle: (result: PreparedDisposition | null) => void;
}

export const useDispositionPromptStore = create<DispositionPromptState>()((set, get) => ({
  prompt: null,
  ask: (name, quantity, scope = 'item') =>
    new Promise((resolve) => set({ prompt: { name, quantity, scope, resolve } })),
  settle: (result) => {
    get().prompt?.resolve(result);
    set({ prompt: null });
  },
}));
