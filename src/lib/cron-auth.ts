import 'server-only';
import { timingSafeEqual } from 'node:crypto';

/** 定期実行からの呼び出しか（Authorization: Bearer <CRON_SECRET>）。未設定なら常に拒否 */
export function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
