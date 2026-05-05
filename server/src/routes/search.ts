import { Router } from 'express';
import type { AuthedRequest } from '../types.js';
import { prisma } from '../lib/prisma.js';
import { boardMembershipWhere } from '../services/board-scope.js';

export const searchRouter = Router();

searchRouter.get('/', async (req, res) => {
  const { userId } = req as unknown as AuthedRequest;
  const q = String(req.query.q || '').trim();
  if (q.length < 2) {
    res.json([]);
    return;
  }

  const boards = await prisma.board.findMany({
    where: boardMembershipWhere(userId),
    select: { id: true },
  });
  const boardIds = boards.map((b) => b.id);
  if (!boardIds.length) {
    res.json([]);
    return;
  }

  const cards = await prisma.card.findMany({
    where: {
      list: { boardId: { in: boardIds } },
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ],
    },
    take: 40,
    orderBy: { updatedAt: 'desc' },
    include: {
      list: {
        include: {
          board: { select: { id: true, name: true } },
        },
      },
    },
  });

  res.json(
    cards.map((c) => ({
      cardId: c.id,
      title: c.title,
      descriptionPreview: c.description.slice(0, 160),
      boardId: c.list.board.id,
      boardName: c.list.board.name,
      listName: c.list.name,
    })),
  );
});
