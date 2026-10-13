import { describe, expect, it } from 'vitest';
import { jsonResponse, scriptedFetch } from '../harness/testing.ts';
import { HttpError, requestJson } from './http.ts';

describe('requestJson', () => {
  it('returns the parsed body of a successful response', async () => {
    const { fetch } = scriptedFetch([() => jsonResponse({ ok: true })]);
    await expect(
      requestJson(fetch, 'https://example.test', {}, { label: 'ping' }),
    ).resolves.toEqual({
      ok: true,
    });
  });

  it('throws an error that names the operation but never the URL', async () => {
    const { fetch } = scriptedFetch([() => jsonResponse({ error: 'denied' }, 403)]);
    const url = 'https://example.test/v1/thing?access_token=TOKEN-VALUE';

    const error: unknown = await requestJson(fetch, url, {}, { label: 'Create thing' }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(HttpError);
    const httpError = error as HttpError;
    expect(httpError.status).toBe(403);
    expect(httpError.message).toContain('Create thing failed with HTTP 403');
    expect(httpError.message).toContain('denied');
    expect(httpError.message).not.toContain('TOKEN-VALUE');
  });

  it('rejects a successful response that is not JSON', async () => {
    const { fetch } = scriptedFetch([() => new Response('<html>gateway</html>', { status: 200 })]);
    await expect(requestJson(fetch, 'https://example.test', {}, { label: 'ping' })).rejects.toThrow(
      /response was not JSON/,
    );
  });
});
