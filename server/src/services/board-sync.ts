import { prisma } from '../lib/prisma.js';

export async function touchBoardTimestamp(boardId: string): Promise<void> {
  await prisma.board.update({
    where: { id: boardId },
    data: { updatedAt: new Date() },
  });
}
