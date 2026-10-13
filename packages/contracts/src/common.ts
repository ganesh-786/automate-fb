import { z } from 'zod';

/**
 * Version stamped into every document. Bump the minor for additive changes and the major for
 * breaking ones; a service must reject documents whose major version it does not know.
 */
export const CONTRACTS_VERSION = '0.1.0';

export const SchemaVersionSchema = z.literal(CONTRACTS_VERSION);

export const PlatformSchema = z.enum(['facebook', 'instagram', 'youtube', 'tiktok']);
export type Platform = z.infer<typeof PlatformSchema>;

export const IdSchema = z.uuid();

export const IsoDateTimeSchema = z.iso.datetime({ offset: true });

/** BCP 47 language tag such as `en`, `en-US` or `ne-NP`. */
export const LanguageTagSchema = z
  .string()
  .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, 'expected a BCP 47 language tag');

/** Lowercase hex SHA-256 digest; approvals and provenance records bind to files with it. */
export const Sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'expected a lowercase hex SHA-256 digest');
