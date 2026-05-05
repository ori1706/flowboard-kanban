import type { Server } from 'socket.io';

let io: Server | null = null;

export function registerIo(instance: Server): void {
  io = instance;
}

export function emitBoardUpdate(
  boardId: string,
  board: unknown,
  meta?: { originClientId?: string },
): void {
  if (!io) return;
  io.to(`board:${boardId}`).emit('board:update', {
    boardId,
    board,
    originClientId: meta?.originClientId,
    ts: Date.now(),
  });
}

export function emitPresence(boardId: string, viewers: ViewerInfo[]): void {
  if (!io) return;
  io.to(`board:${boardId}`).emit('presence:update', { boardId, viewers });
}

export type ViewerInfo = {
  userId: string;
  name: string;
  avatarUrl: string;
  clientId: string;
};
