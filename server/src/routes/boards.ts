import { Router } from 'express';
import type { AuthedRequest } from '../types.js';
import { prisma } from '../lib/prisma.js';
import { touchBoardTimestamp } from '../services/board-sync.js';
import { emitBoardUpdate } from '../realtime.js';
import { getClientId } from '../utils/client-id.js';
import { boardMembershipWhere, isBoardOwner } from '../services/board-scope.js';

export const boardsRouter = Router();

boardsRouter.get('/', async (req, res) => {
  const { userId } = req as unknown as AuthedRequest;
  const boards = await prisma.board.findMany({
    where: boardMembershipWhere(userId),
    orderBy: { updatedAt: 'desc' },
    include: {
      lists: {
        select: { id: true },
      },
      _count: {
        select: {
          lists: true,
          labels: true,
        },
      },
    },
  });
  res.json(
    boards.map((b: (typeof boards)[number]) => ({
      id: b.id,
      name: b.name,
      coverGradient: b.coverGradient,
      updatedAt: b.updatedAt.toISOString(),
      listCount: b._count.lists,
      labelCount: b._count.labels,
    })),
  );
});

boardsRouter.get('/:boardId', async (req, res) => {
  const { userId } = req as unknown as AuthedRequest;
  const { boardId } = req.params;
  const board = await prisma.board.findFirst({
    where: { id: boardId, ...boardMembershipWhere(userId) },
    include: {
      labels: true,
      lists: {
        orderBy: { position: 'asc' },
        include: {
          cards: {
            orderBy: { position: 'asc' },
            include: {
              labels: { include: { label: true } },
              members: { include: { user: true } },
              checklists: {
                orderBy: { id: 'asc' },
                include: {
                  items: { orderBy: { position: 'asc' } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!board) {
    res.status(404).json({ error: 'Board not found' });
    return;
  }
  res.json(serializeBoardDetail(board));
});

boardsRouter.post('/', async (req, res) => {
  const { userId } = req as unknown as AuthedRequest;
  const body = req.body as { name?: string; coverGradient?: string };
  const name = (body.name || 'Untitled').trim().slice(0, 128);
  const coverGradient =
    typeof body.coverGradient === 'string' && body.coverGradient.length > 3
      ? body.coverGradient.slice(0, 400)
      : 'linear-gradient(135deg,#2dd4bf,#6366f1)';
  const board = await prisma.board.create({
    data: {
      name,
      coverGradient,
      ownerId: userId,
    },
  });

  await prisma.label.createMany({
    data: [
      { boardId: board.id, name: 'Feature', color: '#22c55e' },
      { boardId: board.id, name: 'Bug', color: '#ef4444' },
      { boardId: board.id, name: 'Chore', color: '#64748b' },
    ],
  });

  const listTitles = ['To do', 'Doing', 'Done'];
  for (let i = 0; i < listTitles.length; i++) {
    await prisma.list.create({
      data: { boardId: board.id, name: listTitles[i], position: (i + 1) * 1000 },
    });
  }

  const full = await prisma.board.findUniqueOrThrow({
    where: { id: board.id },
    include: {
      labels: true,
      lists: {
        orderBy: { position: 'asc' },
        include: {
          cards: {
            orderBy: { position: 'asc' },
            include: {
              labels: { include: { label: true } },
              members: { include: { user: true } },
              checklists: { include: { items: { orderBy: { position: 'asc' } } } },
            },
          },
        },
      },
    },
  });
  const payload = serializeBoardDetail(full);
  emitBoardUpdate(board.id, payload, { originClientId: getClientId(req) });
  res.status(201).json(payload);
});

boardsRouter.patch('/:boardId', async (req, res) => {
  const { userId } = req as unknown as AuthedRequest;
  const { boardId } = req.params;
  const body = req.body as { name?: string; coverGradient?: string };

  if (!(await isBoardOwner(prisma, userId, boardId))) {
    res.status(404).json({ error: 'Board not found or not authorized' });
    return;
  }
  const data: Record<string, string> = {};
  if (typeof body.name === 'string') data.name = body.name.trim().slice(0, 128);
  if (typeof body.coverGradient === 'string') data.coverGradient = body.coverGradient.slice(0, 400);
  await prisma.board.update({ where: { id: boardId }, data });

  await touchBoardTimestamp(boardId);

  const full = await prisma.board.findUniqueOrThrow({
    where: { id: boardId },
    include: {
      labels: true,
      lists: {
        orderBy: { position: 'asc' },
        include: {
          cards: {
            orderBy: { position: 'asc' },
            include: {
              labels: { include: { label: true } },
              members: { include: { user: true } },
              checklists: { include: { items: { orderBy: { position: 'asc' } } } },
            },
          },
        },
      },
    },
  });
  const payload = serializeBoardDetail(full);
  emitBoardUpdate(boardId, payload, { originClientId: getClientId(req) });
  res.json(payload);
});

boardsRouter.delete('/:boardId', async (req, res) => {
  const { userId } = req as unknown as AuthedRequest;
  const { boardId } = req.params;

  const deleted = await prisma.board.deleteMany({ where: { id: boardId, ownerId: userId } });
  if (deleted.count === 0) {
    res.status(404).json({ error: 'Board not found or not authorized' });
    return;
  }
  res.status(204).send();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeBoardDetail(board: any) {
  return {
    id: board.id,
    name: board.name,
    coverGradient: board.coverGradient,
    updatedAt: board.updatedAt instanceof Date ? board.updatedAt.toISOString() : board.updatedAt,
    labels: board.labels.map((l: { id: string; name: string; color: string }) => ({
      id: l.id,
      name: l.name,
      color: l.color,
    })),
    lists: board.lists.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (list: any) => ({
        id: list.id,
        name: list.name,
        position: list.position,
        cards: list.cards.map(serializeCard),
      }),
    ),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeCard(card: any) {
  return {
    id: card.id,
    listId: card.listId,
    title: card.title,
    description: card.description,
    position: card.position,
    dueDate: card.dueDate instanceof Date ? card.dueDate.toISOString().slice(0, 10) : card.dueDate,
    coverColor: card.coverColor ?? null,
    coverImage: card.coverImage ?? null,
    createdAt: card.createdAt instanceof Date ? card.createdAt.toISOString() : card.createdAt,
    updatedAt: card.updatedAt instanceof Date ? card.updatedAt.toISOString() : card.updatedAt,
    labels:
      card.labels?.map((cl: { label: { id: string; name: string; color: string } }) => ({
        id: cl.label.id,
        name: cl.label.name,
        color: cl.label.color,
      })) ?? [],
    members:
      card.members?.map((m: { user: { id: string; name: string; avatarUrl: string } }) => ({
        id: m.user.id,
        name: m.user.name,
        avatarUrl: m.user.avatarUrl,
      })) ?? [],
    checklists:
      card.checklists?.map((c: { id: string; title: string; items: unknown[] }) => ({
        id: c.id,
        title: c.title,
        items: c.items ?? [],
      })) ?? [],
  };
}
