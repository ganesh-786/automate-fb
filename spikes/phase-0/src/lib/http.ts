const DEFAULT_TIMEOUT_MS = 60_000;
const BODY_EXCERPT_CHARS = 400;

/**
 * A non-2xx response. The message names the operation, never the URL, because several providers
 * require the access token as a query parameter.
 */
export class HttpError extends Error {
  override readonly name = 'HttpError';
  readonly status: number;
  readonly body: string;

  constructor(label: string, status: number, body: string) {
    super(`${label} failed with HTTP ${status}: ${body.slice(0, BODY_EXCERPT_CHARS)}`);
    this.status = status;
    this.body = body;
  }
}

export interface RequestOptions {
  /** Human-readable name of the operation, used in error messages. */
  label: string;
  timeoutMs?: number;
}

/** Sends a request and returns the parsed JSON body. Throws `HttpError` on a non-2xx status. */
export async function requestJson(
  fetchFn: typeof globalThis.fetch,
  url: string,
  init: RequestInit,
  options: RequestOptions,
): Promise<unknown> {
  const response = await fetchFn(url, {
    ...init,
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) throw new HttpError(options.label, response.status, text);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(options.label, response.status, `response was not JSON: ${text}`);
  }
}
