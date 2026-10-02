import { ApiError, isApiErrorBody } from './errors';

/** Per-request context the client attaches as headers. Tenant is derived server-side from the token. */
export interface ClientContext {
  accessToken?: string | null;
  locationId?: string | null;
  deviceId?: string | null;
  language?: string | null;
}

export interface ApiClientOptions {
  baseUrl: string;
  getContext: () => ClientContext;
  /** Called when the server rejects the session (401). */
  onUnauthenticated?: () => void;
  fetchImpl?: typeof fetch;
}

type QueryScalar = string | number | boolean | null | undefined;
/** Arrays serialise as repeated keys: `?id=a&id=b`. */
export type QueryValue = QueryScalar | readonly QueryScalar[];

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface ApiClient {
  request<T>(method: HttpMethod, path: string, options?: RequestOptions): Promise<T>;
  get<T>(path: string, options?: Omit<RequestOptions, 'body'>): Promise<T>;
  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>): Promise<T>;
  put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>): Promise<T>;
  delete<T>(path: string, options?: Omit<RequestOptions, 'body'>): Promise<T>;
}

function buildUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>): string {
  const base = baseUrl.replace(/\/$/, '');
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  const keep = (v: QueryScalar): v is string | number | boolean =>
    v !== undefined && v !== null && v !== '';
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) if (keep(item)) params.append(key, String(item));
    } else if (keep(value as QueryScalar)) {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const doFetch = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function request<T>(method: HttpMethod, path: string, opts: RequestOptions = {}) {
    const ctx = options.getContext();
    const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (ctx.accessToken) headers.Authorization = `Bearer ${ctx.accessToken}`;
    if (ctx.locationId) headers['X-Location-Id'] = ctx.locationId;
    if (ctx.deviceId) headers['X-Device-Id'] = ctx.deviceId;
    if (ctx.language) headers['Accept-Language'] = ctx.language;

    let response: Response;
    try {
      response = await doFetch(buildUrl(options.baseUrl, path, opts.query), {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: opts.signal ?? null,
      });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
      throw new ApiError('NETWORK_ERROR', 'Unable to reach the server', 0);
    }

    const requestId = response.headers.get('X-Request-Id') ?? undefined;
    const text = await response.text();
    let data: unknown = undefined;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      if (isApiErrorBody(data)) {
        // Only a rejected session ends it — e.g. a wrong employee PIN must not sign the device out.
        if (data.error.code === 'UNAUTHENTICATED') options.onUnauthenticated?.();
        const { code, message, details } = data.error;
        throw new ApiError(code, message, response.status, {
          requestId: data.error.requestId ?? requestId,
          ...(details ? { details } : {}),
        });
      }
      if (response.status === 401) options.onUnauthenticated?.();
      throw new ApiError(
        response.status === 401 ? 'UNAUTHENTICATED' : 'INTERNAL_ERROR',
        response.statusText || 'Request failed',
        response.status,
        requestId ? { requestId } : {},
      );
    }

    return data as T;
  }

  return {
    request,
    get: (path, opts) => request('GET', path, opts),
    post: (path, body, opts) => request('POST', path, { ...opts, body }),
    patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
    put: (path, body, opts) => request('PUT', path, { ...opts, body }),
    delete: (path, opts) => request('DELETE', path, opts),
  };
}
