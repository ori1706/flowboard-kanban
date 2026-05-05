# FlowBoard

**FlowBoard** is a production-style Trello-inspired kanban app: boards, lists, cards with markdown, labels, due dates, checklists, comments, members, cover art, optimistic drag-and-drop, and **Socket.IO realtime** with presence highlights.

![FlowBoard](docs/screenshot-placeholder.png)

> Add a full-width screenshot after `npm run dev` at `http://localhost:5173` and save as `docs/screenshot-placeholder.png`.

## Architecture (ASCII)

```
┌──────────────┐      REST + WS       ┌─────────────────────┐
│ Vite React   │ ←──────────────────► │ Express + Socket.IO │
│ Tailwind     │   JWT (localStorage) │ Prisma ORM          │
│ @dnd-kit     │                      │                     │
└──────────────┘                      └──────────┬──────────┘
                                                 │
                                                 ▼
                                         ┌───────────────┐
                                         │ PostgreSQL    │
                                         │ (Supabase or  │
                                         │  Docker)      │
                                         └───────────────┘
```

## Tech stack

| Layer    | Choices |
|---------|---------|
| Frontend | React 18, Vite 6, TypeScript, Tailwind, @dnd-kit, react-query, Socket.IO client, react-markdown |
| Backend  | Express, Socket.IO, Prisma 6, bcrypt, JWT (stateless demo auth) |
| Database | PostgreSQL (Supabase or local Docker on port **5434**) |

## Demo credentials

Auth uses **JWT in `localStorage`** (no cookies) — chosen for iframe / cross-origin demo simplicity.

| User | Password |
|------|----------|
| `demo@flowboard.dev` | `demo1234` |
| `alex@flowboard.dev` | `demo1234` |

Auto-login seeds the demo workspace on load; **Switch user** pill bottom-right swaps accounts and reloads (for two-user presence demos).

## Local setup

### Prereqs

- Node 22+
- Docker (for Postgres only, recommended)

### 1 · Configure env

Copy env files:

```bash
cp .env.example .env           # optional root reference
cp server/.env.example server/.env  # create if missing; see DATABASE_URL below
```

`server/.env` should contain at minimum:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/flowboard?schema=public"
JWT_SECRET=your-32-character-minimum-secret
```

### 2 · Start Postgres

```bash
docker compose up -d postgres
npm install
npm run prepare:local   # generate + migrate + seed (from root)
```

Or manually:

```bash
cd server && npx prisma migrate deploy && npx prisma db seed
```

### 3 · Run dev (client + API)

```bash
npm run dev
```

- **UI:** http://localhost:5173  
- **API + Socket.IO:** http://localhost:4000 (proxied from Vite for `/api` and `/socket.io`)

### Iframe test (shared spec)

1. With dev servers running, open `iframe-test.html` in a browser (or `npx serve .` from repo root — some static servers strip `?port=`; use **`iframe-test.html#port=5177`** matching the port Vite prints, e.g. `http://127.0.0.1:9333/iframe-test.html#port=5177`).
2. Confirm no `X-Frame-Options` block; card modal and drag overlay stay inside the iframe (~1200px and ~800px embeds are on the same page).

## Docker (single container, API + static UI)

```bash
docker build -t flowboard .
docker run --rm -p 4000:4000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/flowboard?schema=public" \
  -e JWT_SECRET="change-me-32-chars-minimum" \
  flowboard
```

App serves the Vite build from Express on port **4000**.

## Database schema (overview)

`User`, `Board`, `BoardAccess`, `List`, `Card`, `Label`, `CardLabel`, `Checklist`, `ChecklistItem`, `Comment`, `Activity` — see `server/prisma/schema.prisma`.

## Seeded boards (demo)

| Board | Lists (sample) | Notes |
|-------|----------------|-------|
| **Personal** | Soon, This week, Groceries, Someday / Maybe | Mix of due dates, checklist, comment |
| **Q3 Roadmap** | Discovery, In Progress, Review, Release, Won't ship | Markdown card, multi-label, threaded comments |
| **Bug Triage** | Inbox, Repro needed, Fix staged, Shipped patch | P0 card, cover image, activity seed |

Total cards in seed: **16** across lists (varied labels, covers, members Alex + You).

## Deployment

### GitHub

```bash
gh repo create ori1706/flowboard-kanban --public --source=. --push --description "FlowBoard — realtime kanban"
```

### Vercel (frontend-only path)

```bash
cd client && npx vercel --prod --yes --name kanban-showcase-flow
```

Set `VITE_API_URL` / `VITE_SOCKET_URL` to your deployed API origin at **build** time (these are baked into the client bundle). If interactive auth is required, complete login in the CLI and re-run. Use a unique `--name` to avoid colliding with other showcase projects on a shared Vercel team.

### Backend (Fly / Render / Railway)

- **Fly.io:** edit `fly.toml` `app` name, then `fly launch` / `fly deploy` with `DATABASE_URL` secret.
- **Render:** use `render.yaml` blueprint; set `DATABASE_URL` in dashboard.
- **Supabase:** create project → copy connection string into `DATABASE_URL`.

### Headers (iframe)

Express sets **`Content-Security-Policy: frame-ancestors *`** (via custom header) and does **not** send `X-Frame-Options`. Verify production:

```bash
curl -I https://your-api-host/health
```

## Iframe embed (parent career page)

```html
<iframe
  src="https://YOUR-DEPLOYED-URL"
  width="100%"
  height="720"
  style="border:0;border-radius:16px"
  title="FlowBoard"
  allow="autoplay; clipboard-write"
  loading="lazy"
></iframe>
```

For local dev:

```html
<iframe src="http://localhost:5173" width="1200" height="720" title="FlowBoard" allow="autoplay; clipboard-write"></iframe>
```

## DnD + iframe notes

- **Modal:** Rendered with `createPortal` into `#flowboard-modal-root`, a child of `.flowboard-shell` with `position: relative` and `overflow: hidden` — avoids viewport-fixed clipping in iframes.
- **DragOverlay:** Uses `@dnd-kit` default overlay; keep the app shell `overflow: hidden` on the modal layer only; board area uses horizontal scroll for lists.
- **Socket:** `io({ cors: { origin: true, credentials: true } })` on the server; Vite dev proxies WebSocket.

## License

MIT (portfolio / demo use).
