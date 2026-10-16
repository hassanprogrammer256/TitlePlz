import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../lib/errors.js';

type Schemas = { body?: ZodType; params?: ZodType; query?: ZodType };

/**
 * Validates req.body / req.params / req.query with zod and replaces them with
 * the parsed (typed, coerced, stripped) values. Throws a 400 AppError on failure.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (!result.success) {
        const issues = result.error.issues.map((i) => ({
          in: part,
          path: i.path.join('.'),
          message: i.message,
        }));
        const first = issues[0]!;
        const where = first.path ? `${first.in}.${first.path}` : first.in;
        return next(AppError.badRequest(`Invalid ${where}: ${first.message}`, issues));
      }
      // Express 5 exposes req.query as a prototype getter; shadow it on the instance instead of assigning.
      Object.defineProperty(req, part, { value: result.data, writable: true, configurable: true, enumerable: true });
    }
    next();
  };
}
