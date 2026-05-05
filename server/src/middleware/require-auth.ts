import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../auth-token.js';
import type { AuthedRequest, JwtPayload } from '../types.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me-32characters';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const payload = verifyToken(JWT_SECRET, req.headers.authorization);
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  (req as AuthedRequest).userId = payload.userId;
  next();
}

export function getJwtSecret(): string {
  return JWT_SECRET;
}

export type { JwtPayload };
