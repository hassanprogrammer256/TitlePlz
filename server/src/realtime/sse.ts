import type { Response } from 'express';

/**
 * Minimal Server-Sent Events hub for the public analytics stream (`/api/analytics/stream`).
 * Carries only aggregate, non-private data; private events use Socket.IO rooms instead.
 */
const MAX_CLIENTS = 500;
const clients = new Set<Response>();

export function sseClientCount() {
  return clients.size;
}

/** Returns false when the hub is full. */
export function addSseClient(res: Response): boolean {
  if (clients.size >= MAX_CLIENTS) return false;
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // tell nginx-style proxies not to buffer the stream
  });
  res.flushHeaders();
  res.write('retry: 5000\n\n');
  clients.add(res);
  res.on('close', () => clients.delete(res));
  return true;
}

export function sendSse(res: Response, event: string, payload: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

export function broadcastSse(event: string, payload: unknown) {
  for (const res of clients) {
    try {
      sendSse(res, event, payload);
    } catch {
      clients.delete(res);
    }
  }
}

/** Comment lines keep idle connections alive through proxies. */
export function pingSseClients() {
  for (const res of clients) {
    try {
      res.write(': ping\n\n');
    } catch {
      clients.delete(res);
    }
  }
}

export function closeAllSseClients() {
  for (const res of clients) res.end();
  clients.clear();
}
