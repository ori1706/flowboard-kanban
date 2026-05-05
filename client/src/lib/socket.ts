import { io } from 'socket.io-client';
import { getToken, socketOrigin } from '@/lib/session';

export function createSocketInstance() {
  const tok = getToken();
  if (!tok) return null;
  const url = socketOrigin();
  const opts = {
    path: '/socket.io/',
    auth: { token: tok },
    transports: ['websocket', 'polling'] as ('websocket' | 'polling')[],
  };
  return url.length > 0 ? io(url, opts) : io(opts);
}
