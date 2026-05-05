import { Router } from 'express';
import type { AuthedRequest } from '../types.js';
import { prisma } from '../lib/prisma.js';
import { betweenPositions } from '../utils/position.js';
import { touchBoardTimestamp } from '../services/board-sync.js';
import { serializeBoardDetail } from './boards.js';
import { emitBoardUpdate } from '../realtime.js';
import { getClientId } from '../utils/client-id.js';
import { boardMembershipWhere } from '../services/board-scope.js';

async function hasBoardAccess(userId: string, boardId: string): Promise<boolean> {
  const row = await prisma.board.findFirst({
    where: { id: boardId, ...boardMembershipWhere(userId) },
    select: { id: true },
  });
  return Boolean(row);
}

export const cardsRouter = Router();

/** Must be registered before /:cardId routes */
cardsRouter.patch('/checklist-items/:itemId', async (req, res) => {
  const { userId } = req as unknown as AuthedRequest;
  const { itemId } = req.params;
  const body = req.body as { done?: boolean; text?: string; position?: number };

  const item = await prisma.checklistItem.findFirst({
    where: { id: itemId },
    include: {
      checklist: {
        include: {
          card: {
            include: {
              list: { include: { board: true } },
            },
          },
        },
      },
    },
  });
  if (!item || !(await hasBoardAccess(userId, item.checklist.card.list.boardId))) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const data: { done?: boolean; text?: string; position?: number } = {};
  if (typeof body.done === 'boolean') data.done = body.done;
  if (typeof body.text === 'string') data.text = body.text.slice(0, 500);
  if (typeof body.position === 'number' && Number.isFinite(body.position)) data.position = body.position;

  await prisma.checklistItem.update({ where: { id: itemId }, data });

  const boardId = item.checklist.card.list.boardId;

  await prisma.activity.create({
    data: {
      cardId: item.checklist.cardId,
      boardId,
      userId,
      type: body.done != null ? 'checklist_toggle' : 'checklist_edit',
      payload: { checklistId: item.checklistId, itemId },
    },
  });

  await touchBoardTimestamp(boardId);

  const full = await loadBoard(boardId);
  emitBoardUpdate(boardId, full, { originClientId: getClientId(req) });
  res.json(full);
});

cardsRouter.post('/', async (req, res) => {
  const { userId } = req as unknown as AuthedRequest;
  const body = req.body as { listId?: string; title?: string; position?: number };

  if (!body.listId) {
    res.status(400).json({ error: 'listId required' });
    return;
  }
  const list = await prisma.list.findFirst({
    where: { id: body.listId },
    include: { board: true },
  });
  if (!list || !(await hasBoardAccess(userId, list.boardId))) {
    res.status(404).json({ error: 'List not found' });
    return;
  }

  let position = body.position;
  if (position == null || !Number.isFinite(position)) {
    const last = await prisma.card.findFirst({
      where: { listId: body.listId },
      orderBy: { position: 'desc' },
    });
    position = betweenPositions(last?.position ?? null, null);
  }

  const card = await prisma.card.create({
    data: {
      listId: body.listId,
      title: (body.title || 'New card').trim().slice(0, 200),
      description: '',
      position,
    },
  });

  await prisma.activity.create({
    data: {
      cardId: card.id,
      boardId: list.boardId,
      userId,
      type: 'card_created',
      payload: { title: card.title },
    },
  });

  await touchBoardTimestamp(list.boardId);
  const full = await loadBoard(list.boardId);
  emitBoardUpdate(list.boardId, full, { originClientId: getClientId(req) });
  res.status(201).json(full);
});

cardsRouter.get('/:cardId', async (req, res) => {
  const { userId } = req as unknown as AuthedRequest;
  const { cardId } = req.params;

  const card = await prisma.card.findFirst({
    where: { id: cardId },
    include: {
      list: { include: { board: true } },
      labels: { include: { label: true } },
      members: { include: { user: true } },
      checklists: { include: { items: { orderBy: { position: 'asc' } } } },
      comments: {
        orderBy: { createdAt: 'asc' },
        include: { user: true },
      },
      activities: {
        orderBy: { createdAt: 'desc' },
        take: 80,
        include: { user: true },
      },
    },
  });

  if (!card || !(await hasBoardAccess(userId, card.list.boardId))) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  res.json(serializeCardDetail(card));
});

cardsRouter.patch('/:cardId', async (req, res) => {
  const { userId } = req as unknown as AuthedRequest;
  const { cardId } = req.params;
  const body = req.body as {
    title?: string;
    description?: string;
    listId?: string;
    position?: number;
    dueDate?: string | null;
    coverColor?: string | null;
    coverImage?: string | null;
    labelIds?: string[];
  };

  const card = await prisma.card.findFirst({
    where: { id: cardId },
    include: { list: { include: { board: true } } },
  });
  if (!card || !(await hasBoardAccess(userId, card.list.boardId))) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const oldListId = card.listId;
  const oldTitle = card.title;

  const data: Record<string, unknown> = {};
  if (typeof body.title === 'string') data.title = body.title.trim().slice(0, 200);
  if (typeof body.description === 'string') data.description = body.description.slice(0, 20000);
  if (body.dueDate === null) data.dueDate = null;
  else if (typeof body.dueDate === 'string') {
    const d = new Date(body.dueDate);
    if (!Number.isNaN(d.getTime())) data.dueDate = d;
  }
  if (body.coverColor === null) data.coverColor = null;
  else if (typeof body.coverColor === 'string') data.coverColor = body.coverColor.slice(0, 32);
  if (body.coverImage === null) data.coverImage = null;
  else if (typeof body.coverImage === 'string') data.coverImage = body.coverImage.slice(0, 500);

  if (typeof body.listId === 'string' && body.listId !== card.listId) {
    data.listId = body.listId;
  }
  if (typeof body.position === 'number' && Number.isFinite(body.position)) {
    data.position = body.position;
  }

  await prisma.card.update({
    where: { id: cardId },
    data,
  });

  if (body.labelIds && Array.isArray(body.labelIds)) {
    await prisma.cardLabel.deleteMany({ where: { cardId } });
    const uniq = [...new Set(body.labelIds)].filter(Boolean);
    if (uniq.length) {
      await prisma.cardLabel.createMany({
        data: uniq.map((labelId) => ({ cardId, labelId })),
        skipDuplicates: true,
      });
    }
  }

  /** Activity for move between lists */
  if (typeof body.listId === 'string' && body.listId !== oldListId) {
    const [fromList, toList] = await Promise.all([
      prisma.list.findUnique({ where: { id: oldListId } }),
      prisma.list.findUnique({ where: { id: body.listId } }),
    ]);
    await prisma.activity.create({
      data: {
        cardId,
        boardId: card.list.boardId,
        userId,
        type: 'card_moved_list',
        payload: {
          fromListId: oldListId,
          toListId: body.listId,
          fromListName: fromList?.name,
          toListName: toList?.name,
        },
      },
    });
  }

  /** Activity for title change when significant */
  if (typeof body.title === 'string' && body.title !== oldTitle) {
    await prisma.activity.create({
      data: {
        cardId,
        boardId: card.list.boardId,
        userId,
        type: 'card_renamed',
        payload: { from: oldTitle, to: body.title },
      },
    });
  }

  await touchBoardTimestamp(card.list.boardId);

  const full = await loadBoard(card.list.boardId);
  emitBoardUpdate(card.list.boardId, full, { originClientId: getClientId(req) });
  res.json(full);
});

cardsRouter.delete('/:cardId', async (req, res) => {
  const { userId } = req as unknown as AuthedRequest;
  const { cardId } = req.params;

  const card = await prisma.card.findFirst({
    where: { id: cardId },
    include: { list: { include: { board: true } } },
  });
  if (!card || !(await hasBoardAccess(userId, card.list.boardId))) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const boardId = card.list.boardId;
  await prisma.card.delete({ where: { id: cardId } });
  await touchBoardTimestamp(boardId);
  const full = await loadBoard(boardId);
  emitBoardUpdate(boardId, full, { originClientId: getClientId(req) });
  res.json(full);
});

cardsRouter.post('/:cardId/comments', async (req, res) => {
  const { userId } = req as unknown as AuthedRequest;
  const { cardId } = req.params;
  const body = req.body as { body?: string };
  const text = body.body?.trim();
  if (!text) {
    res.status(400).json({ error: 'body required' });
    return;
  }

  const card = await prisma.card.findFirst({
    where: { id: cardId },
    include: { list: { include: { board: true } } },
  });
  if (!card || !(await hasBoardAccess(userId, card.list.boardId))) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  await prisma.comment.create({
    data: {
      cardId,
      userId,
      body: text.slice(0, 4000),
    },
  });

  await prisma.activity.create({
    data: {
      cardId,
      boardId: card.list.boardId,
      userId,
      type: 'comment_added',
      payload: { preview: text.slice(0, 120) },
    },
  });

  await touchBoardTimestamp(card.list.boardId);

  const updated = await prisma.card.findFirstOrThrow({
    where: { id: cardId },
    include: {
      list: { include: { board: true } },
      labels: { include: { label: true } },
      members: { include: { user: true } },
      checklists: { include: { items: { orderBy: { position: 'asc' } } } },
      comments: { orderBy: { createdAt: 'asc' }, include: { user: true } },
      activities: { orderBy: { createdAt: 'desc' }, take: 80, include: { user: true } },
    },
  });
  const boardPayload = await loadBoard(card.list.boardId);
  emitBoardUpdate(card.list.boardId, boardPayload, { originClientId: getClientId(req) });
  res.status(201).json({ detail: serializeCardDetail(updated), board: boardPayload });
});

cardsRouter.post('/:cardId/checklists', async (req, res) => {
  const { userId } = req as unknown as AuthedRequest;
  const { cardId } = req.params;
  const body = req.body as { title?: string; items?: string[] };

  const card = await prisma.card.findFirst({
    where: { id: cardId },
    include: { list: { include: { board: true } } },
  });
  if (!card || !(await hasBoardAccess(userId, card.list.boardId))) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const checklist = await prisma.checklist.create({
    data: {
      cardId,
      title: (body.title || 'Checklist').trim().slice(0, 160),
      items:
        Array.isArray(body.items) && body.items.length > 0
          ? {
              create: body.items.map((t, i) => ({
                text: String(t).slice(0, 400),
                position: (i + 1) * 1000,
              })),
            }
          : {
              create: [{ text: 'First step', position: 1000 }],
            },
    },
    include: { items: true },
  });

  await prisma.activity.create({
    data: {
      cardId,
      boardId: card.list.boardId,
      userId,
      type: 'checklist_created',
      payload: { checklistId: checklist.id, title: checklist.title },
    },
  });

  await touchBoardTimestamp(card.list.boardId);

  const fullBoard = await loadBoard(card.list.boardId);
  emitBoardUpdate(card.list.boardId, fullBoard, { originClientId: getClientId(req) });
  res.status(201).json({ checklist, board: fullBoard });
});

async function loadBoard(boardId: string) {
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
  return serializeBoardDetail(full);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeCardDetail(card: any) {
  return {
    id: card.id,
    listId: card.listId,
    boardId: card.list.boardId,
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
      card.checklists?.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (c: any) => ({
          id: c.id,
          title: c.title,
          items: (c.items ?? []).map((i: { id: string; text: string; done: boolean; position: number }) => ({
            id: i.id,
            text: i.text,
            done: i.done,
            position: i.position,
          })),
        }),
      ) ?? [],
    comments:
      card.comments?.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (c: any) => ({
          id: c.id,
          body: c.body,
          createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
          user: {
            id: c.user.id,
            name: c.user.name,
            avatarUrl: c.user.avatarUrl,
          },
        }),
      ) ?? [],
    activities:
      card.activities?.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (a: any) => ({
          id: a.id,
          type: a.type,
          payload: a.payload ?? {},
          createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
          user: { id: a.user.id, name: a.user.name, avatarUrl: a.user.avatarUrl },
        }),
      ) ?? [],
  };
}
