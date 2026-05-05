import { Router } from 'express';
import type { AuthedRequest } from '../types.js';
import { prisma } from '../lib/prisma.js';
import { betweenPositions } from '../utils/position.js';
import { touchBoardTimestamp } from '../services/board-sync.js';
import { serializeBoardDetail } from './boards.js';
import { emitBoardUpdate } from '../realtime.js';
import { getClientId } from '../utils/client-id.js';
import { boardMembershipWhere } from '../services/board-scope.js';

export const listsRouter = Router();

listsRouter.post('/', async (req, res) => {
  const { userId } = req as unknown as AuthedRequest;
  const body = req.body as { boardId?: string; name?: string };
  if (!body.boardId || !body.name?.trim()) {
    res.status(400).json({ error: 'boardId and name required' });
    return;
  }
  const board = await prisma.board.findFirst({
    where: { id: body.boardId, ...boardMembershipWhere(userId) },
  });
  if (!board) {
    res.status(404).json({ error: 'Board not found' });
    return;
  }
  const last = await prisma.list.findFirst({
    where: { boardId: body.boardId },
    orderBy: { position: 'desc' },
  });
  const position = betweenPositions(last?.position ?? null, null);
  await prisma.list.create({
    data: {
      boardId: body.boardId,
      name: body.name.trim().slice(0, 128),
      position,
    },
  });
  await touchBoardTimestamp(body.boardId);

  const full = await prisma.board.findUniqueOrThrow({
    where: { id: body.boardId },
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
  emitBoardUpdate(body.boardId, payload, { originClientId: getClientId(req) });
  res.status(201).json(payload);
});

listsRouter.patch('/:listId', async (req, res) => {
  const { userId } = req as unknown as AuthedRequest;
  const { listId } = req.params;
  const body = req.body as { name?: string; position?: number };

  const list = await prisma.list.findFirst({
    where: { id: listId },
    include: { board: true },
  });
  const canAccess =
    list &&
    (await prisma.board.findFirst({
      where: { id: list.boardId, ...boardMembershipWhere(userId) },
      select: { id: true },
    }));
  if (!list || !canAccess) {
    res.status(404).json({ error: 'List not found' });
    return;
  }

  const data: { name?: string; position?: number } = {};
  if (typeof body.name === 'string') data.name = body.name.trim().slice(0, 128);
  if (typeof body.position === 'number' && Number.isFinite(body.position)) data.position = body.position;

  if (Object.keys(data).length) {
    await prisma.list.update({ where: { id: listId }, data });
  }
  await touchBoardTimestamp(list.boardId);

  const full = await prisma.board.findUniqueOrThrow({
    where: { id: list.boardId },
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
  const payloadP = serializeBoardDetail(full);
  emitBoardUpdate(list.boardId, payloadP, { originClientId: getClientId(req) });
  res.json(payloadP);
});

listsRouter.delete('/:listId', async (req, res) => {
  const { userId } = req as unknown as AuthedRequest;
  const { listId } = req.params;

  const list = await prisma.list.findFirst({
    where: { id: listId },
    include: { board: true },
  });
  const canAccessDel =
    list &&
    (await prisma.board.findFirst({
      where: { id: list.boardId, ...boardMembershipWhere(userId) },
      select: { id: true },
    }));
  if (!list || !canAccessDel) {
    res.status(404).json({ error: 'List not found' });
    return;
  }
  const boardId = list.boardId;
  await prisma.list.delete({ where: { id: listId } });
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
  const payloadD = serializeBoardDetail(full);
  emitBoardUpdate(boardId, payloadD, { originClientId: getClientId(req) });
  res.json(payloadD);
});
