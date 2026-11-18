import 'server-only';
import { createHash, randomBytes } from 'node:crypto';

export const INVITE_DAYS = 7;

export function newInviteToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
