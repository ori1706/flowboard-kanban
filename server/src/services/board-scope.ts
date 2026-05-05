import type { PrismaClient } from '@prisma/client';

/** Owner or explicit board share (see BoardAccess seed for demo collaborator). */
export function boardMembershipWhere(userId: string) {
  return {
    OR: [{ ownerId: userId }, { accesses: { some: { userId } } }],
  };
}

export async function requireBoardScope(prisma: PrismaClient, userId: string, boardId: string) {
  return prisma.board.findFirst({
    where: { id: boardId, ...boardMembershipWhere(userId) },
    select: { id: true, ownerId: true },
  });
}

export async function isBoardOwner(prisma: PrismaClient, userId: string, boardId: string) {
  const row = await prisma.board.findFirst({
    where: { id: boardId, ownerId: userId },
    select: { id: true },
  });
  return Boolean(row);
}
