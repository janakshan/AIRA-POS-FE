import type { ErrorCode, Paginated } from '@rbp/types';
import { toFieldErrors } from '@rbp/validation';
import { newId } from '@rbp/utils';
import { delay, HttpResponse, type HttpResponseResolver } from 'msw';
import type { z } from 'zod';
import { mockConfig } from './config';

export const API = '/api/v1';

export function apiError(
  code: ErrorCode,
  status: number,
  message: string,
  details?: Record<string, unknown>,
) {
  const requestId = newId('req');
  return HttpResponse.json(
    { error: { code, message, requestId, ...(details ? { details } : {}) } },
    { status, headers: { 'X-Request-Id': requestId } },
  );
}

/** Thrown inside handlers to short-circuit with an error response. */
export class MockHttpError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/**
 * Wrap a resolver with simulated latency, dev-tools failure injection and
 * MockHttpError → JSON error mapping. `devOnly` endpoints skip injected failures.
 */
export function handle(
  resolver: HttpResponseResolver,
  opts: { devOnly?: boolean } = {},
): HttpResponseResolver {
  return async (info) => {
    const { latencyMs, failure } = mockConfig.getState();
    if (latencyMs > 0 && !opts.devOnly) await delay(latencyMs);
    if (!opts.devOnly) {
      if (failure === 'network') return HttpResponse.error();
      if (failure === 'server') return apiError('INTERNAL_ERROR', 500, 'Simulated server error');
      if (failure === 'unauthorized' && !info.request.url.includes('/auth/login')) {
        return apiError('UNAUTHENTICATED', 401, 'Simulated expired session');
      }
    }
    try {
      return await resolver(info);
    } catch (error) {
      if (error instanceof MockHttpError)
        return apiError(error.code, error.status, error.message, error.details);
      throw error;
    }
  };
}

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/** Slice a filtered list into the `Paginated<T>` contract using `page`/`pageSize` query params. */
export function paginate<T>(items: T[], url: URL): Paginated<T> {
  const int = (key: string, fallback: number) => {
    const n = Number.parseInt(url.searchParams.get(key) ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const page = int('page', 1);
  const pageSize = Math.min(int('pageSize', DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page, pageSize, total: items.length };
}

/** Validate a JSON body against a shared zod schema; 400 VALIDATION_FAILED with `fieldErrors` otherwise. */
export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const body: unknown = await request.json().catch(() => undefined);
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new MockHttpError('VALIDATION_FAILED', 400, 'Request body is invalid', {
      fieldErrors: toFieldErrors(result.error),
    });
  }
  return result.data;
}
