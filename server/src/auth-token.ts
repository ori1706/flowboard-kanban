import jwt from 'jsonwebtoken';
import type { JwtPayload } from './types.js';

export function signToken(secret: string, payload: JwtPayload): string {
  return jwt.sign(payload, secret, { expiresIn: '30d' });
}

export function verifyToken(secret: string, authHeader?: string): JwtPayload | null {
  const h = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  if (!h) return null;
  try {
    return jwt.verify(h, secret) as JwtPayload;
  } catch {
    return null;
  }
}

export function verifyTokenRaw(secret: string, token?: string): JwtPayload | null {
  if (!token) return null;
  try {
    return jwt.verify(token, secret) as JwtPayload;
  } catch {
    return null;
  }
}
