/**
 * Stateless JWT demo auth — localStorage client-side avoids iframe SameSite pitfalls.
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { Server as IOServer } from 'socket.io';

import { signToken, verifyToken } from './auth-token.js';
import { prisma } from './lib/prisma.js';
import { boardsRouter } from './routes/boards.js';
import { cardsRouter } from './routes/cards.js';
import { listsRouter } from './routes/lists.js';
import { searchRouter } from './routes/search.js';
import { requireAuth } from './middleware/require-auth.js';
import { attachSocket } from './socket.js';
import { registerIo } from './realtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me-32characters';

const app = express();

/** Iframe-friendly: explicit permissive CSP; no X-Frame-Options */
app.use((_req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://images.unsplash.com https://picsum.photos blob:; connect-src 'self' ws: wss: http://localhost:* https:; frame-ancestors *;",
  );
  next();
});

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  }),
);
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/demo', async (_req, res) => {
  const email = 'demo@flowboard.dev'.toLowerCase();
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: 'You',
        avatarUrl:
          'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=96&h=96&q=80',
        passwordHash: await bcrypt.hash('demo1234', 10),
      },
    });
  }
  const token = signToken(JWT_SECRET, { userId: user.id, email: user.email });
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl },
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'email and password required' });
    return;
  }
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  const token = signToken(JWT_SECRET, { userId: user.id, email: user.email });
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl },
  });
});

app.get('/api/me', async (req, res) => {
  const payload = verifyToken(JWT_SECRET, req.headers.authorization);
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, name: true, email: true, avatarUrl: true },
  });
  res.json(user);
});

app.use('/api/boards', requireAuth, boardsRouter);
app.use('/api/lists', requireAuth, listsRouter);
app.use('/api/cards', requireAuth, cardsRouter);
app.use('/api/search', requireAuth, searchRouter);

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  next();
});

const staticDir = path.join(__dirname, '../../client/dist');
if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get(/^(?!\/socket\.io).*/, (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

const httpServer = createServer(app);

const io = new IOServer(httpServer, {
  cors: {
    origin: true,
    credentials: true,
  },
  path: '/socket.io/',
});

registerIo(io);
attachSocket(io, prisma, JWT_SECRET);

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`FlowBoard API + Socket.IO listening on http://localhost:${PORT}`);
});
