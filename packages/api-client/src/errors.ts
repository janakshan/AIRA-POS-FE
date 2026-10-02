import type { ApiErrorBody, ErrorCode } from '@rbp/types';

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly requestId: string | undefined;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    status: number,
    extra: { requestId?: string; details?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.requestId = extra.requestId;
    this.details = extra.details;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorBody).error?.code === 'string'
  );
}
