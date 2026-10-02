import { isApiError } from '@rbp/api-client';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

/**
 * Map a 400 VALIDATION_FAILED / 409 CONFLICT `details.fieldErrors` ({ path: i18nKey }) onto
 * react-hook-form fields — the same contract from MSW now and NestJS later.
 * Returns true when at least one field error was applied (caller skips its toast).
 */
export function applyServerErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  error: unknown,
): boolean {
  if (!isApiError(error)) return false;
  const fieldErrors = error.details?.fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== 'object') return false;
  const known = new Set(Object.keys(form.getValues()));
  let applied = false;
  for (const [path, message] of Object.entries(fieldErrors as Record<string, unknown>)) {
    if (typeof message !== 'string' || !known.has(path.split('.')[0] ?? '')) continue;
    form.setError(path as Path<T>, { type: 'server', message }, { shouldFocus: !applied });
    applied = true;
  }
  return applied;
}
