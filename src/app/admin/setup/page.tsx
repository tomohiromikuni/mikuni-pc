import { SettingsTabs } from '@/components/AdminNav';
import Link from 'next/link';
import { Card, PageTitle } from '@/components/ui';
import { requireAdmin } from '@/lib/auth';
import { env } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Check = { label: string; ok: boolean; fix: string; detail?: string };

/** 足りない設定を一覧で表示（管理者のみ） */
export default async function SetupPage() {
  await requireAdmin();
  const db = createAdminClient();
  const has = async (table: string, column = '*') => {
    const { error } = await db.from(table).select(column, { head: true, count: 'exact' }).limit(1);
    return !error;
  };
  const [attachments, chat, surveys, push, audit, signup, bucket, holidays, stuck, overview, dual] = await Promise.all([
    has('attachments'),
    has('chat_rooms'),
    has('surveys'),
    has('push_subscriptions'),
    has('audit_logs'),
    has('classes', 'open_for_signup'),
    db.storage.getBucket('attachments').then((r) => !r.error),
    db.from('calendar_days').select('day', { count: 'exact', head: true }).then((r) => (r.error ? -1 : r.count ?? 0)),
    db
      .from('notification_queue')
      .select('id', { count: 'exact', head: true })
      .is('sent_at', null)
      .lt('send_after', new Date(Date.now() - 10 * 60000).toISOString())
      .then((r) => (r.error ? -1 : r.count ?? 0)),
    db.rpc('trainee_overview').then((r) => !r.error || !/function|does not exist|find/i.test(r.error.message)),
    has('profiles', 'also_trainee'),
  ]);
  const dbAll = attachments && chat && surveys && push && audit && signup;
  const SQL = 'Supabase の SQL Editor で supabase/setup/update-to-0.8.sql を全部貼り付けて Run';

  const checks: Check[] = [
    { label: 'データベース：添付ファイル（段階2）', ok: attachments && bucket, fix: SQL },
    { label: 'データベース：チャット（段階3）', ok: chat, fix: SQL },
    { label: 'データベース：出欠・アンケート（段階4）', ok: surveys, fix: SQL },
    { label: 'データベース：通知（段階5）', ok: push, fix: SQL },
    { label: 'データベース：スタッフ・操作ログ（段階6）', ok: audit, fix: SQL },
    { label: 'データベース：共通QRからの登録', ok: signup, fix: SQL },
    { label: 'データベース：運営メンバーが訓練生の画面を使う機能', ok: dual, fix: 'Supabase の SQL Editor で supabase/setup/update-to-0.15.sql を貼り付けて Run' },
    { label: 'データベース：訓練生一覧の目印（通知・欠席）', ok: overview, fix: 'Supabase の SQL Editor で supabase/setup/update-to-0.13.sql を貼り付けて Run' },
    { label: '通知の鍵（VAPID）', ok: !!env.vapidPublicKey() && !!process.env.VAPID_PRIVATE_KEY, fix: 'Vercel の Environment Variables に NEXT_PUBLIC_VAPID_PUBLIC_KEY と VAPID_PRIVATE_KEY を追加して Redeploy' },
    { label: '定期実行の合言葉（CRON_SECRET）', ok: (process.env.CRON_SECRET ?? '').length >= 16, fix: 'Vercel の Environment Variables に CRON_SECRET を追加して Redeploy' },
    {
      label: '通知の定期送信が動いている',
      ok: dbAll && stuck === 0,
      fix: 'Supabase で pg_cron と pg_net を有効にし、supabase/setup/cron.sql の★を書き換えて実行',
      detail: stuck > 0 ? `送信されずに10分以上たった通知が ${stuck} 件あります` : undefined,
    },
    { label: '祝日データ', ok: holidays > 0, fix: '「設定」の「通知・休みの日」で「内閣府の祝日データを取り込む」を押す' },
  ];
  const done = checks.filter((c) => c.ok).length;

  return (
    <div className="space-y-4">
      <SettingsTabs isAdmin />
      <p>{done === checks.length ? '✅ すべての設定が完了しています。' : `${checks.length}項目中 ${done}項目が完了しています。上から順に設定してください。`}</p>
      <Card className="p-0">
        <ul className="divide-y line">
          {checks.map((c) => (
            <li key={c.label} className="flex gap-3 px-4 py-3">
              <span className="text-xl" aria-label={c.ok ? '完了' : '未設定'}>{c.ok ? '✅' : '⚠️'}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{c.label}</span>
                {!c.ok && <span className="block text-sm text-red-800">→ {c.fix}</span>}
                {c.detail && <span className="block text-sm">{c.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <p className="text-sm">
        SQLファイルは GitHub の <a className="text-brand-700 underline" href="https://github.com/tomohiromikuni/mikuni-pc/blob/main/supabase/setup/update-to-0.8.sql" target="_blank" rel="noreferrer">update-to-0.8.sql</a> から、右上のコピーボタンでコピーできます。
        設定後にこの画面を開き直すと、結果が更新されます。
      </p>
    </div>
  );
}
