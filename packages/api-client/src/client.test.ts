import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './client';
import { ApiError } from './errors';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createApiClient', () => {
  it('attaches context headers', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }));
    const client = createApiClient({
      baseUrl: 'http://api.test/',
      getContext: () => ({ accessToken: 'tok', locationId: 'loc1', language: 'ta' }),
      fetchImpl,
    });
    await client.get('/api/v1/me', { query: { a: 1, b: undefined } });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('http://api.test/api/v1/me?a=1');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers['X-Location-Id']).toBe('loc1');
    expect(headers['Accept-Language']).toBe('ta');
  });

  it('serialises booleans and repeats array keys; sends PUT bodies', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })));
    const client = createApiClient({ baseUrl: '', getContext: () => ({}), fetchImpl });
    await client.get('/p', { query: { active: true, id: ['a', '', 'b'], page: 0, q: '' } });
    expect(fetchImpl.mock.calls[0]![0]).toBe('/p?active=true&id=a&id=b&page=0');

    await client.put('/p/1', { name: 'x' });
    const [, init] = fetchImpl.mock.calls[1]!;
    expect(init?.method).toBe('PUT');
    expect(init?.body).toBe('{"name":"x"}');
  });

  it('maps error bodies to ApiError with stable codes', async () => {
    const onUnauthenticated = vi.fn();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: { code: 'UNAUTHENTICATED', message: 'no' } }, 401));
    const client = createApiClient({
      baseUrl: '',
      getContext: () => ({}),
      fetchImpl,
      onUnauthenticated,
    });
    await expect(client.get('/x')).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
    expect(onUnauthenticated).toHaveBeenCalled();
  });

  it('maps network failures to NETWORK_ERROR', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    const client = createApiClient({ baseUrl: '', getContext: () => ({}), fetchImpl });
    const error = await client.get('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('NETWORK_ERROR');
  });
});

describe('session handling', () => {
  it('does not end the session for non-auth 4xx errors', async () => {
    const onUnauthenticated = vi.fn();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: { code: 'INVALID_PIN', message: 'no' } }, 422));
    const client = createApiClient({
      baseUrl: '',
      getContext: () => ({}),
      fetchImpl,
      onUnauthenticated,
    });
    await expect(client.post('/x')).rejects.toMatchObject({ code: 'INVALID_PIN' });
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });
});
