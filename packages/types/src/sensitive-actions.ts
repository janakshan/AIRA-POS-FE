import type { Permission } from './saas';

export interface SensitiveActionPolicy {
  /** Permission the verifying employee must hold. */
  permission: Permission;
  /** Employee PIN required (POS-006). */
  pin: boolean;
  /** Reason required (POS-007). */
  reason: boolean;
  /** English label used in dialogs and the audit log. */
  label: string;
  /** Where the rule applies, for docs/tests. */
  stage: 'always' | 'saved-order' | 'paid-order';
}

/**
 * The single list of sensitive actions (REQ-217…232). Both the POS client (which dialogs to
 * show) and the API (what to enforce) read it, so they can't drift apart.
 */
export const SENSITIVE_ACTIONS = {
  'pos.item.quantity.decrease': {
    permission: 'pos.item.cancel',
    pin: true,
    reason: true,
    label: 'Reduce item quantity',
    stage: 'saved-order',
  },
  'pos.item.remove': {
    permission: 'pos.item.cancel',
    pin: true,
    reason: true,
    label: 'Remove item',
    stage: 'saved-order',
  },
  'pos.order.cancel': {
    permission: 'pos.order.void',
    pin: true,
    reason: true,
    label: 'Cancel order',
    stage: 'saved-order',
  },
  'pos.discount.apply': {
    permission: 'pos.discount.apply',
    pin: true,
    reason: true,
    label: 'Apply discount',
    stage: 'always',
  },
  'pos.price.override': {
    permission: 'pos.price.override',
    pin: true,
    reason: true,
    label: 'Change price',
    stage: 'always',
  },
  'pos.charge.manage': {
    permission: 'pos.charge.manage',
    pin: true,
    reason: true,
    label: 'Change charges',
    stage: 'always',
  },
  'pos.drawer.open': {
    permission: 'pos.drawer.open',
    pin: true,
    reason: true,
    label: 'Open cash drawer',
    stage: 'always',
  },
  'pos.invoice.void': {
    permission: 'pos.order.void',
    pin: true,
    reason: true,
    label: 'Void invoice',
    stage: 'paid-order',
  },
  'pos.return': {
    permission: 'pos.refund',
    pin: true,
    reason: true,
    label: 'Process return',
    stage: 'paid-order',
  },
  'pos.refund': {
    permission: 'pos.refund',
    pin: true,
    reason: true,
    label: 'Refund payment',
    stage: 'paid-order',
  },
  'restaurant.table.transfer': {
    permission: 'restaurant.table.transfer',
    pin: true,
    reason: true,
    label: 'Transfer table',
    stage: 'saved-order',
  },
  'inventory.adjust': {
    permission: 'inventory.adjust',
    pin: true,
    reason: true,
    label: 'Adjust stock',
    stage: 'always',
  },
  'production.wastage': {
    permission: 'production.manage',
    pin: true,
    reason: true,
    label: 'Write off bakery goods',
    stage: 'always',
  },
  'wholesale.return': {
    permission: 'wholesale.manage',
    pin: true,
    reason: true,
    label: 'Accept shop return',
    stage: 'always',
  },
  'staff.meal': {
    permission: 'staff.manage',
    pin: true,
    reason: true,
    label: 'Approve staff meal',
    stage: 'always',
  },
} as const satisfies Record<string, SensitiveActionPolicy>;

export type SensitiveActionCode = keyof typeof SENSITIVE_ACTIONS;

export const SENSITIVE_ACTION_CODES = Object.keys(SENSITIVE_ACTIONS) as SensitiveActionCode[];

export function isSensitiveAction(code: string | undefined): code is SensitiveActionCode {
  return !!code && code in SENSITIVE_ACTIONS;
}
