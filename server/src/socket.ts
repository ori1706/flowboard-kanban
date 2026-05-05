import type { Server, Socket } from 'socket.io';
import type { PrismaClient } from '@prisma/client';
import { verifyTokenRaw } from './auth-token.js';
import { emitPresence, type ViewerInfo } from './realtime.js';
import { boardMembershipWhere } from './services/board-scope.js';

const boardRooms = new Map<string, Map<string, ViewerInfo & { socketId: string }>>();

function addViewer(boardId: string, socket: Socket, info: ViewerInfo): void {
  if (!boardRooms.has(boardId)) boardRooms.set(boardId, new Map());
  const m = boardRooms.get(boardId)!;
  m.set(socket.id, { ...info, socketId: socket.id });
}

function removeViewer(boardId: string, socketId: string): void {
  const m = boardRooms.get(boardId);
  if (!m) return;
  m.delete(socketId);
  if (m.size === 0) boardRooms.delete(boardId);
}

function viewersFor(boardId: string): ViewerInfo[] {
  const m = boardRooms.get(boardId);
  if (!m) return [];
  return [...m.values()].map(({ userId, name, avatarUrl, clientId }) => ({
    userId,
    name,
    avatarUrl,
    clientId,
  }));
}

export function attachSocket(io: Server, prisma: PrismaClient, jwtSecret: string): void {
  io.use((socket, next) => {
    const token =
      (socket.handshake.auth as { token?: string })?.token ||
      (socket.handshake.query.token as string | undefined);
    const payload = verifyTokenRaw(jwtSecret, token);
    if (!payload) {
      next(new Error('Unauthorized'));
      return;
    }
    socket.data.userId = payload.userId;
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;

    socket.on('board:join', async (msg: { boardId: string; clientId: string }, ack) => {
      const { boardId, clientId } = msg || {};
      if (!boardId || !clientId) {
        ack?.({ ok: false });
        return;
      }

      const board = await prisma.board.findFirst({
        where: { id: boardId, ...boardMembershipWhere(userId) },
        select: { id: true },
      });
      if (!board) {
        ack?.({ ok: false });
        return;
      }

      void socket.join(`board:${boardId}`);

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, avatarUrl: true },
      });
      if (!user) {
        ack?.({ ok: false });
        return;
      }

      addViewer(boardId, socket, {
        userId: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
        clientId,
      });

      emitPresence(boardId, viewersFor(boardId));
      ack?.({ ok: true });
    });

    socket.on('board:leave', (msg: { boardId?: string }) => {
      const boardId = msg?.boardId;
      if (!boardId) return;
      void socket.leave(`board:${boardId}`);
      removeViewer(boardId, socket.id);
      emitPresence(boardId, viewersFor(boardId));
    });

    socket.on('disconnect', () => {
      for (const [bid, m] of [...boardRooms.entries()]) {
        if (m.has(socket.id)) {
          removeViewer(bid, socket.id);
          emitPresence(bid, viewersFor(bid));
        }
      }
    });
  });
}
