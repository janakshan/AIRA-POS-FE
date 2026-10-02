import { SENSITIVE_ACTIONS, type SensitiveActionCode } from '@rbp/types';
import type { TFunction } from 'i18next';

/** Localised label for a sensitive action; keys use `_` because codes contain dots. */
export function sensitiveActionLabel(t: TFunction, action: SensitiveActionCode): string {
  return t(`auth:sensitiveActions.${action.replace(/\./g, '_')}`, {
    defaultValue: SENSITIVE_ACTIONS[action].label,
  });
}
