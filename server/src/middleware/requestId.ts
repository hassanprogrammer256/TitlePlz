import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import 'pino-http'; // augments IncomingMessage with `id`

/** Tags every request with an id (reuses a sane incoming X-Request-Id) and echoes it back. */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  const id = incoming && /^[\w.-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
};
