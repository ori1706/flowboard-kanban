import { getClientId, getToken } from '@/lib/session';

/** Render free-tier cold starts can exceed 60s; stay below browser default limits ~5min */
const FETCH_TIMEOUT_MS = 90_000;

async function fetchApi(path: string, init?: RequestInit) {
  const token = getToken();
  const headers = new Headers(init?.headers);
  headers.set('X-Client-Id', getClientId());
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const base = import.meta.env.VITE_API_URL || '';
  const ctrl = new AbortController();
  const tid = window.setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      headers,
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error(
        'Request timed out. If the API is on Render’s free tier, cold starts can take well over a minute—wait and tap Retry.',
      );
    }
    throw e;
  } finally {
    window.clearTimeout(tid);
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') ?? '';
  if (path.startsWith('/api') && !ct.includes('application/json')) {
    throw new Error(
      'API returned non-JSON (often VITE_API_URL is missing on the Vercel build, so /api is served as HTML). Set VITE_API_URL + VITE_SOCKET_URL in Vercel → Environment Variables and redeploy.',
    );
  }
  return res.json() as unknown;
}

export const api = {
  authDemo: () => fetchApi('/api/auth/demo', { method: 'POST' }),
  login: (email: string, password: string) =>
    fetchApi('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
  me: () => fetchApi('/api/me'),
  boards: () => fetchApi('/api/boards'),
  board: (id: string) => fetchApi(`/api/boards/${id}`),
  createBoard: (name: string, coverGradient?: string) =>
    fetchApi('/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, coverGradient }),
    }),
  patchBoard: (id: string, patch: Record<string, string>) =>
    fetchApi(`/api/boards/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  createList: (boardId: string, name: string) =>
    fetchApi('/api/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boardId, name }),
    }),
  patchList: (listId: string, patch: { name?: string; position?: number }) =>
    fetchApi(`/api/lists/${listId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  deleteList: (listId: string) => fetchApi(`/api/lists/${listId}`, { method: 'DELETE' }),
  createCard: (listId: string, title?: string, position?: number) =>
    fetchApi('/api/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listId, title, position }),
    }),
  cardDetail: (cardId: string) => fetchApi(`/api/cards/${cardId}`),
  patchCard: (cardId: string, patch: Record<string, unknown>) =>
    fetchApi(`/api/cards/${cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  comment: (cardId: string, body: string) =>
    fetchApi(`/api/cards/${cardId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    }),
  checklist: (cardId: string, title?: string, items?: string[]) =>
    fetchApi(`/api/cards/${cardId}/checklists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, items }),
    }),
  checklistItemPatch: (
    itemId: string,
    patch: Partial<{ done: boolean; text: string; position: number }>,
  ) =>
    fetchApi(`/api/cards/checklist-items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  search: (q: string) => fetchApi(`/api/search?q=${encodeURIComponent(q)}`),
};
