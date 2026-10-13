import { ScriptDraftSchema } from '@automate/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toProviderJsonSchema } from './json-schema.ts';

/** Every keyword used anywhere in a schema, ignoring property names. */
function keywordsIn(node: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    node.forEach((item) => keywordsIn(item, found));
  } else if (node !== null && typeof node === 'object') {
    for (const [keyword, value] of Object.entries(node)) {
      found.add(keyword);
      if (keyword === 'properties') {
        Object.values(value as Record<string, unknown>).forEach((schema) =>
          keywordsIn(schema, found),
        );
      } else if (keyword !== 'enum' && keyword !== 'required') {
        keywordsIn(value, found);
      }
    }
  }
  return found;
}

describe('toProviderJsonSchema', () => {
  it('drops keywords the provider does not document', () => {
    const schema = toProviderJsonSchema(
      z.object({
        name: z
          .string()
          .min(2)
          .max(10)
          .regex(/^[a-z]+$/)
          .describe('A short name.'),
        id: z.uuid(),
        when: z.iso.datetime(),
        count: z.number().min(1).max(5),
      }),
    );

    expect(schema).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string', description: 'A short name.' },
        id: { type: 'string' },
        when: { type: 'string', format: 'date-time' },
        count: { type: 'number', minimum: 1, maximum: 5 },
      },
      required: ['name', 'id', 'when', 'count'],
      additionalProperties: false,
    });
  });

  it('keeps a property that happens to be named like an unsupported keyword', () => {
    const schema = toProviderJsonSchema(z.object({ pattern: z.string(), minLength: z.number() }));
    expect(Object.keys(schema.properties as object)).toEqual(['pattern', 'minLength']);
  });

  it('reduces the real script contract to supported keywords only', () => {
    const allowed = new Set([
      'type',
      'description',
      'properties',
      'required',
      'additionalProperties',
      'enum',
      'minimum',
      'maximum',
      'items',
      'minItems',
      'maxItems',
    ]);
    const used = keywordsIn(toProviderJsonSchema(ScriptDraftSchema));

    expect([...used].filter((keyword) => !allowed.has(keyword))).toEqual([]);
    expect(used.has('enum')).toBe(true); // camera moves and platforms survive
    expect(used.has('minItems')).toBe(true); // "at least three scenes" survives
  });
});
