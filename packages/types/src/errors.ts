/** Stable business error codes shared by the mock API and the future NestJS API. */
export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'FORBIDDEN',
  'FEATURE_NOT_ENABLED',
  'LOCATION_NOT_ALLOWED',
  'TENANT_NOT_FOUND',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'INVALID_PIN',
  'EMPLOYEE_LOCKED',
  'VERIFICATION_REQUIRED',
  'EMPLOYEE_NOT_AUTHORIZED',
  /** The PIN is valid but that employee isn't assigned to this location (HR-003 clock in). */
  'EMPLOYEE_WRONG_LOCATION',
  'CONFLICT',
  'NETWORK_ERROR',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    requestId?: string;
    details?: Record<string, unknown>;
  };
}
