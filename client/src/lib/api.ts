import { getClientId, getToken } from '@/lib/session';

async function fetchApi(path: string, init?: RequestInit) {
  const token = getToken();
  const headers = new Headers(init?.headers);
  headers.set('X-Client-Id', getClientId());
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const base = import.meta.env.VITE_API_URL || '';
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  if (res.status === 204) return null;
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
