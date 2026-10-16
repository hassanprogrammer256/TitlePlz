import type { Server as HttpServer } from 'node:http';
import { parseCookie } from 'cookie';
import { Server } from 'socket.io';
import { SESSION_COOKIE, verifySession } from '../auth/session.js';
import { config } from '../config/env.js';
import { prisma } from '../db/client.js';
import { logger } from '../lib/logger.js';

let io: Server | null = null;

export const rooms = {
  user: (userId: string) => `user:${userId}`,
  drop: (dropId: string) => `drop:${dropId}`,
};

const ID_RE = /^[\w-]{1,64}$/;

export function initRealtime(server: HttpServer): Server {
  io = new Server(server, {
    path: '/socket.io',
    cors: { origin: config.CLIENT_ORIGIN, credentials: true },
  });

  // Bind the socket to the session cookie sent with the handshake. Anonymous sockets are
  // allowed (public drop rooms) but never get a private room.
  io.use(async (socket, next) => {
    try {
      const token = parseCookie(socket.handshake.headers.cookie ?? '')[SESSION_COOKIE];
      const userId = verifySession(token);
      if (userId && (await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) {
        socket.data.userId = userId;
      }
    } catch (err) {
      logger.warn({ err }, 'socket auth lookup failed; continuing as anonymous');
    }
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string | undefined;
    if (userId) void socket.join(rooms.user(userId));
    logger.debug({ socketId: socket.id, userId }, 'socket connected');

    // Drop rooms are public (they only carry data any viewer of the drop can see).
    socket.on('join_drop', (dropId: unknown) => {
      if (typeof dropId === 'string' && ID_RE.test(dropId)) void socket.join(rooms.drop(dropId));
    });
    socket.on('leave_drop', (dropId: unknown) => {
      if (typeof dropId === 'string' && ID_RE.test(dropId)) void socket.leave(rooms.drop(dropId));
    });

    // The client still emits join_user(id). Ignored on purpose: the private room is joined above
    // from the verified session, never from a client-supplied id.
    socket.on('join_user', () => {});
  });

  return io;
}

export function activeSocketCount(): number {
  return io ? io.engine.clientsCount : 0;
}

/** Sockets currently watching a drop (shown as "detectives examining"). */
export function dropViewerCount(dropId: string): number {
  return io?.sockets.adapter.rooms.get(rooms.drop(dropId))?.size ?? 0;
}

export function emitToDrop(dropId: string, event: string, payload: unknown) {
  io?.to(rooms.drop(dropId)).emit(event, payload);
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(rooms.user(userId)).emit(event, payload);
}

export function broadcast(event: string, payload: unknown) {
  io?.emit(event, payload);
}

export async function closeRealtime(): Promise<void> {
  if (!io) return;
  await io.close();
  io = null;
}
