import type { Request } from 'express';

export function getClientId(req: Request): string | undefined {
  const h = req.headers['x-client-id'];
  return typeof h === 'string' ? h : undefined;
}
