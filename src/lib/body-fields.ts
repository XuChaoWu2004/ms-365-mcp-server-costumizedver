import { z } from 'zod';

// Narrows a request-body schema to an endpoint's allowlisted fields so models
// never see (or send) read-only fields like id or createdDateTime
export function pickBodyFields(schema: z.ZodTypeAny, fields: readonly string[]): z.ZodTypeAny {
  if (schema instanceof z.ZodObject) {
    const missing = fields.filter((f) => !Object.prototype.hasOwnProperty.call(schema.shape, f));
    if (missing.length > 0) {
      throw new Error(`bodyFields not in body schema: ${missing.join(', ')}`);
    }
    const mask: Record<string, true> = Object.fromEntries(fields.map((f) => [f, true]));
    return schema.pick(mask);
  }
  if (schema instanceof z.ZodOptional) {
    return pickBodyFields(schema.unwrap(), fields).optional();
  }
  if (schema instanceof z.ZodNullable) {
    return pickBodyFields(schema.unwrap(), fields).nullable();
  }
  if (schema instanceof z.ZodLazy) {
    return pickBodyFields(schema.schema, fields);
  }
  throw new Error('bodyFields requires an object body schema');
}

// Reports top-level body keys outside the allowlist (in order), so execution
// can reject them before Graph is called; JSON-string bodies are parsed first
export function findDisallowedBodyFields(body: unknown, fields: readonly string[]): string[] {
  let parsed: unknown = body;
  if (typeof body === 'string') {
    try {
      parsed = JSON.parse(body);
    } catch {
      return []; // non-JSON is Graph's problem - it 400s without writing anything
    }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [];
  }
  return Object.keys(parsed).filter((k) => !fields.includes(k));
}
