const TOKEN_KEY = 'flowboard.token';
const CLIENT_KEY = 'flowboard.clientId';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getClientId(): string {
  let id = sessionStorage.getItem(CLIENT_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(CLIENT_KEY, id);
  }
  return id;
}

export function apiOrigin(): string {
  return import.meta.env.VITE_API_URL || '';
}

export function socketOrigin(): string {
  return import.meta.env.VITE_SOCKET_URL || '';
}
