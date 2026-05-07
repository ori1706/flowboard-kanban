import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const u = (id: string) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=128&h=128&q=72`;

async function wipe() {
  await prisma.comment.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.cardLabel.deleteMany();
  await prisma.cardMember.deleteMany();
  await prisma.checklistItem.deleteMany();
  await prisma.checklist.deleteMany();
  await prisma.card.deleteMany();
  await prisma.label.deleteMany();
  await prisma.list.deleteMany();
  await prisma.boardAccess.deleteMany();
  await prisma.board.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  await wipe();

  const pass = await bcrypt.hash('demo1234', 10);

  const you = await prisma.user.create({
    data: {
      name: 'You',
      email: 'demo@flowboard.dev',
      passwordHash: pass,
      avatarUrl: u('1472099645785-5658abf4ff4e'),
    },
  });

  const alex = await prisma.user.create({
    data: {
      name: 'Alex Rivera',
      email: 'alex@flowboard.dev',
      passwordHash: pass,
      avatarUrl: u('1507003211169-0a1dd7228f2d'),
    },
  });

  /** --- Personal --- */
  const personal = await prisma.board.create({
    data: {
      name: 'Personal',
      ownerId: you.id,
      coverGradient: 'linear-gradient(135deg,#8b5cf6,#db2777)',
      lists: {
        create: [
          { name: 'Soon', position: 1000 },
          { name: 'This week', position: 2000 },
          { name: 'Groceries', position: 3000 },
          { name: 'Someday / Maybe', position: 4000 },
        ],
      },
      labels: {
        create: [
          { name: 'Home', color: '#818cf8' },
          { name: 'Finance', color: '#fbbf24' },
          { name: 'Health', color: '#34d399' },
        ],
      },
    },
    include: { lists: true, labels: true },
  });

  /** --- Roadmap --- */
  const roadmap = await prisma.board.create({
    data: {
      name: 'Q3 Roadmap',
      ownerId: you.id,
      coverGradient: 'linear-gradient(135deg,#14b8a6,#0891b2)',
      lists: {
        create: [
          { name: 'Discovery', position: 1000 },
          { name: 'In Progress', position: 2000 },
          { name: 'Review', position: 3000 },
          { name: 'Release', position: 4000 },
          { name: 'Won\'t ship', position: 5000 },
        ],
      },
      labels: {
        create: [
          { name: 'API', color: '#38bdf8' },
          { name: 'Growth', color: '#f97316' },
          { name: 'Infra', color: '#94a3b8' },
        ],
      },
    },
    include: { lists: true, labels: true },
  });

  /** --- Bug Triage --- */
  const triage = await prisma.board.create({
    data: {
      name: 'Bug Triage',
      ownerId: you.id,
      coverGradient: 'linear-gradient(135deg,#e11d48,#ea580c)',
      lists: {
        create: [
          { name: 'Inbox', position: 1000 },
          { name: 'Repro needed', position: 2000 },
          { name: 'Fix staged', position: 3000 },
          { name: 'Shipped patch', position: 4000 },
        ],
      },
      labels: {
        create: [
          { name: 'P0', color: '#f43f5e' },
          { name: 'P2', color: '#facc15' },
          { name: 'Customer voice', color: '#a855f7' },
        ],
      },
    },
    include: { lists: true, labels: true },
  });

  await prisma.boardAccess.createMany({
    data: [
      { boardId: personal.id, userId: alex.id },
      { boardId: roadmap.id, userId: alex.id },
      { boardId: triage.id, userId: alex.id },
    ],
  });

  const listByBoard = async (bid: string, name: string) =>
    prisma.list.findFirstOrThrow({
      where: { boardId: bid, name },
    });

  const labelByBoard = async (bid: string, lbl: string) =>
    prisma.label.findFirstOrThrow({ where: { boardId: bid, name: lbl } });

  /** Personal cards */
  const plSoon = await listByBoard(personal.id, 'Soon');
  const plWeek = await listByBoard(personal.id, 'This week');
  const lgHome = await labelByBoard(personal.id, 'Home');
  const lgFinance = await labelByBoard(personal.id, 'Finance');

  await prisma.card.create({
    data: {
      listId: plSoon.id,
      title: 'Deep clean espresso machine',
      description:
        '### Steps\n\n- Backflush with tablets\n- Soak dispersion screen overnight\n\n**Parts:** gasket kit inbound Saturday.',
      position: 1000,
      dueDate: new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 3),
      coverColor: '#0f172a',
      labels: {
        create: [{ label: { connect: { id: lgHome.id } } }],
      },
      members: {
        create: [{ userId: alex.id }, { userId: you.id }],
      },
      comments: {
        create: [
          {
            userId: alex.id,
            body: 'Reminder: Cafiza runs at the office too — wanna batch this?',
          },
        ],
      },
      checklists: {
        create: {
          title: 'Prep checklist',
          items: {
            create: [
              { text: 'Order blind basket', position: 1000 },
              { text: 'Drain hot water tap', position: 2000, done: true },
            ],
          },
        },
      },
    },
  });

  await prisma.card.create({
    data: {
      listId: plSoon.id,
      title: 'Plan weekend ride — coastal loop',
      description: 'Roughly **72 km** with brunch stop.\n\n- Check wind on Sunday morning routes.\n',
      position: 2000,
      coverImage:
        'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=70',
      members: { create: [{ userId: you.id }] },
    },
  });

  await prisma.card.create({
    data: {
      listId: plWeek.id,
      title: 'Submit expense report · Oct travel',
      description: '`flights.pdf` consolidated in Downloads — upload to payroll portal.',
      position: 1000,
      dueDate: new Date(new Date().setDate(new Date().getDate() - 2)),
      labels: { create: [{ label: { connect: { id: lgFinance.id } } }] },
      checklists: {
        create: {
          title: 'Receipt checklist',
          items: {
            create: [
              { text: 'Amsterdam hotel VAT', position: 1000, done: false },
              { text: 'Client dinner receipts', position: 2000, done: false },
              { text: 'Upload PDF bundle', position: 3000, done: false },
            ],
          },
        },
      },
    },
  });

  /** Roadmap cards */
  const rdDisc = await listByBoard(roadmap.id, 'Discovery');
  const rdProg = await listByBoard(roadmap.id, 'In Progress');
  const lblApi = await labelByBoard(roadmap.id, 'API');
  const lblInfra = await labelByBoard(roadmap.id, 'Infra');
  const lblGrowth = await labelByBoard(roadmap.id, 'Growth');

  await prisma.card.create({
    data: {
      listId: rdProg.id,
      title: 'Realtime presence layer on boards',
      description:
        '🎯 **Objective:** Presence avatars beside board title while keeping Socket.IO footprint lean.\n\n`emit` aggregated presence every 750ms throttle.',
      position: 1000,
      dueDate: new Date(new Date().setDate(new Date().getDate() + 14)),
      coverColor: '#0e7490',
      labels: { create: [{ label: { connect: { id: lblApi.id } } }] },
      members: { create: [{ userId: alex.id }, { userId: you.id }] },
      comments: {
        create: [
          {
            userId: you.id,
            body: 'We should debounce bursts when someone obsessively taps reorder.',
          },
          {
            userId: alex.id,
            body: 'Yep — exponential backoff on reconcile + skip echo for same tab clientId?',
          },
        ],
      },
    },
  });

  await prisma.card.create({
    data: {
      listId: rdDisc.id,
      title: 'Research: Postgres vs SQLite for demos',
      description: '> Dual-mode makes README longer but onboarding friction drops.\n\n- [ ] Measure cold start latency\n',
      position: 1000,
      labels: {
        create: [{ label: { connect: { id: lblInfra.id } } }],
      },
    },
  });

  /** More roadmap bulk */
  await prisma.card.createMany({
    data: [
      {
        listId: rdProg.id,
        title: 'Inline markdown preview parity',
        description: 'Ensure `react-markdown` + tables render with same palette as prose kit.',
        position: 2500,
        dueDate: new Date(new Date().setDate(new Date().getDate() + 45)),
      },
      {
        listId: rdDisc.id,
        title: 'Empty board illustration pack',
        description: 'Commission small SVG suite for onboarding empty lanes.',
        position: 1800,
        coverImage:
          'https://images.unsplash.com/photo-1550684848-facff54d7e5c?auto=format&fit=crop&w=900&q=70',
      },
      {
        listId: rdDisc.id,
        title: 'Template library starter kits',
        description: 'Growth angle: outbound template gallery with shareable previews.',
        position: 2600,
      },
    ],
  });

  await prisma.card.create({
    data: {
      listId: await listByBoard(roadmap.id, 'Review').then((x) => x.id),
      title: 'Keyboard shortcuts rollout',
      description: '`n` focuses list composer, `e` opens inline title edits once focus ring clarified.',
      position: 3200,
      labels: {
        create: [{ label: { connect: { id: lblGrowth.id } } }],
      },
      checklists: {
        create: {
          title: 'QA',
          items: {
            create: [
              { text: 'Firefox focus trap', position: 1000, done: true },
              { text: 'Safari overlay z-index smoke', position: 2000, done: false },
            ],
          },
        },
      },
    },
  });

  /** Triage deck */
  const bgInbox = await listByBoard(triage.id, 'Inbox');
  const bgRepro = await listByBoard(triage.id, 'Repro needed');
  const lP0 = await labelByBoard(triage.id, 'P0');

  const cCritical = await prisma.card.create({
    data: {
      listId: bgInbox.id,
      title: 'Mobile drag ghost clipped under browser chrome',
      description:
        'Safari/iOS WebKit truncates drag overlay bounds in nested views — **severity high**.\n\n```\nnavigator.userAgent\n```\nCaptured in staging.',
      position: 900,
      dueDate: new Date(new Date().setDate(new Date().getDate() + 1)),
      coverColor: '#450a0a',
      labels: { create: [{ label: { connect: { id: lP0.id } } }] },
      members: { create: [{ userId: alex.id }, { userId: you.id }] },
      comments: {
        create: [
          {
            userId: alex.id,
            body: 'I can bisect `@dnd-kit` overlay portal target — wanna pair Tuesday?',
          },
        ],
      },
    },
  });

  await prisma.activity.createMany({
    data: [
      {
        boardId: triage.id,
        cardId: cCritical.id,
        userId: you.id,
        type: 'card_moved_list',
        payload: { message: 'Seeded backlog → Inbox' },
      },
    ],
  });

  await prisma.card.createMany({
    data: [
      {
        listId: bgInbox.id,
        title: 'Search highlighting crashes on surrogate pairs',
        description: '🐛 React devtools shows invalid hook call when escaping regex aggressively.',
        position: 1850,
        dueDate: new Date(new Date().setDate(new Date().getDate() + 19)),
      },
      {
        listId: bgRepro.id,
        title: 'Due date urgency tokens mismatch dark mode AA',
        description: 'Contrast on amber urgency chip fails WCAG in forced-colors mode.',
        position: 1000,
        coverImage:
          'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=900&q=70',
      },
      {
        listId: await listByBoard(triage.id, 'Fix staged').then((x) => x.id),
        title: 'Label palette overflow ellipsis bug',
        description: 'Stacks more than six labels — chip row should wrap cleanly.',
        position: 2300,
        dueDate: new Date(new Date().setDate(new Date().getDate() + 36)),
      },
      {
        listId: await listByBoard(triage.id, 'Shipped patch').then((x) => x.id),
        title: 'Timezone drift on DST boundary',
        description: 'Fixed upstream — verifying regression suite passing.',
        position: 1000,
        dueDate: new Date(new Date().setDate(new Date().getDate() - 5)),
      },
    ],
  });

  console.log(
    JSON.stringify({
      seeded: true,
      users: [you.email, alex.email],
      boards: [
        personal.name,
        roadmap.name,
        triage.name,
      ],
      credentials: 'demo1234',
    }),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
