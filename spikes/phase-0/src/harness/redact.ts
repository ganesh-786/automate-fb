/** Environment variables whose values must never reach a log line or a report file. */
export const SECRET_ENV_KEYS = [
  'GEMINI_API_KEY',
  'CLOUDFLARE_API_TOKEN',
  'META_PAGE_ACCESS_TOKEN',
  'META_APP_SECRET',
  'BUFFER_API_KEY',
] as const;

/** Shorter values are too likely to match ordinary text. */
const MIN_SECRET_LENGTH = 8;

export function secretValues(env: Readonly<Record<string, string | undefined>>): string[] {
  return SECRET_ENV_KEYS.map((key) => env[key]?.trim() ?? '').filter(
    (value) => value.length >= MIN_SECRET_LENGTH,
  );
}

/** Replaces every occurrence of a known secret, so an echoed token cannot leak via an error. */
export function redactSecrets(text: string, secrets: readonly string[]): string {
  return secrets.reduce((result, secret) => result.split(secret).join('[redacted]'), text);
}
