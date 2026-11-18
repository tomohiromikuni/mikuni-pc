import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

/** 定期実行からの呼び出しか（Authorization: Bearer <CRON_SECRET>） */
export function isCronRequest(req: Request): boolean {
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${env.cronSecret()}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
