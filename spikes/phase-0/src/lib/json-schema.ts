import { z } from 'zod';

/**
 * JSON Schema keywords Gemini documents as supported for structured output.
 * Source: https://ai.google.dev/gemini-api/docs/structured-output (checked 2026-10-13).
 */
const SUPPORTED_KEYWORDS = new Set([
  'type',
  'title',
  'description',
  'properties',
  'required',
  'additionalProperties',
  'enum',
  'minimum',
  'maximum',
  'items',
  'prefixItems',
  'minItems',
  'maxItems',
]);

const SUPPORTED_FORMATS = new Set(['date-time', 'date', 'time']);

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function prune(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(prune);
  if (!isObject(node)) return node;

  const result: Record<string, unknown> = {};
  for (const [keyword, value] of Object.entries(node)) {
    if (keyword === 'format') {
      if (typeof value === 'string' && SUPPORTED_FORMATS.has(value)) result[keyword] = value;
    } else if (keyword === 'properties' && isObject(value)) {
      // The keys here are property names, not keywords, so only their schemas are pruned.
      result[keyword] = Object.fromEntries(
        Object.entries(value).map(([name, schema]) => [name, prune(schema)]),
      );
    } else if (keyword === 'enum' || keyword === 'required') {
      result[keyword] = value;
    } else if (SUPPORTED_KEYWORDS.has(keyword)) {
      result[keyword] = prune(value);
    }
  }
  return result;
}

/**
 * Converts a zod schema to the JSON Schema subset a model provider accepts. Constraints the
 * provider does not understand (string lengths, patterns) are dropped here and enforced
 * afterwards by parsing the model's answer with the original zod schema.
 */
export function toProviderJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const pruned = prune(z.toJSONSchema(schema));
  if (!isObject(pruned)) throw new TypeError('schema did not convert to a JSON Schema object');
  return pruned;
}
