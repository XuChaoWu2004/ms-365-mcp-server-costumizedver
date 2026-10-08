import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { pickBodyFields, findDisallowedBodyFields } from '../src/lib/body-fields.js';

describe('bodyFields', () => {
  const obj = z
    .object({
      id: z.string().optional(),
      title: z.string().nullish(),
      attachments: z.array(z.any()).optional(),
    })
    .passthrough();

  it('keeps only the listed keys', () => {
    expect(Object.keys((pickBodyFields(obj, ['title']) as z.AnyZodObject).shape)).toEqual([
      'title',
    ]);
  });

  it('preserves optional / nullable wrappers and resolves lazy', () => {
    expect(pickBodyFields(obj.optional(), ['title'])).toBeInstanceOf(z.ZodOptional);
    expect(pickBodyFields(obj.nullable(), ['title'])).toBeInstanceOf(z.ZodNullable);
    expect(
      pickBodyFields(
        z.lazy(() => obj),
        ['title']
      )
    ).toBeInstanceOf(z.ZodObject);
  });

  it('throws when a field is missing from the schema', () => {
    expect(() => pickBodyFields(obj, ['title', 'nope'])).toThrow(/^bodyFields.*nope/);
  });

  it('throws for a non-object schema', () => {
    expect(() => pickBodyFields(z.string(), ['title'])).toThrow(/^bodyFields/);
  });

  it('lists top-level keys outside the allowlist', () => {
    expect(findDisallowedBodyFields({ title: 'x', id: 'a' }, ['title'])).toEqual(['id']);
    expect(findDisallowedBodyFields({ title: 'x' }, ['title'])).toEqual([]);
  });

  it('parses a JSON-string body before checking', () => {
    expect(findDisallowedBodyFields('{"title":"x","extensions":[]}', ['title'])).toEqual([
      'extensions',
    ]);
    expect(findDisallowedBodyFields('not json', ['title'])).toEqual([]);
  });

  it('ignores non-object bodies', () => {
    for (const b of [null, undefined, 42, ['title']])
      expect(findDisallowedBodyFields(b, ['title'])).toEqual([]);
  });
});
