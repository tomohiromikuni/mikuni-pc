import Link from 'next/link';
import { PushSetup } from '@/components/PushSetup';
import { Card, LinkButton, Notice, PriorityBadge, type Flash } from '@/components/ui';
import { hasPerm, requireStaff } from '@/lib/auth';
import { env } from '@/lib/env';
import { friendlyDateTime } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

/** 管理画面のホーム（デザイン案A：スマホでも見やすい1列の構成） */
export default async function Dashboard({ searchParams }: { searchParams: Promise<Flash> }) {
  const me = await requireStaff();
  const { error, message } = await searchParams;
  const supabase = await createClient();
  const [canChat, canAnnounce, canSurvey] = await Promise.all([hasPerm('chat'), hasPerm('announce'), hasPerm('survey')]);

  const [{ data: anns }, { data: rooms, error: notReady }, { data: att }] = await Promise.all([
    supabase
      .from('announcements')
      .select('id, title, priority, status, publish_at, published_at, announcement_recipients(read_at)')
      .order('created_at', { ascending: false })
      .limit(6),
    // 返信が必要なチャット（最後に送ったのが訓練生）
    canChat
      ? supabase
          .from('chat_rooms')
          .select('id, last_message_at, profiles!chat_rooms_trainee_id_fkey(full_name), chat_reads(user_id, last_read_at), chat_messages(body, created_at)')
          .eq('last_sender_role', 'trainee')
          .order('last_message_at', { ascending: false })
          .order('created_at', { referencedTable: 'chat_messages', ascending: false })
          .limit(1, { referencedTable: 'chat_messages' })
      : supabase.from('chat_rooms').select('id', { head: true }).limit(1),
    // いちばん新しい出欠確認の回答状況
    canSurvey
      ? supabase
          .from('surveys')
          .select('id, title, survey_recipients(responded_at)')
          .eq('kind', 'attendance')
          .neq('status', 'draft')
          .order('published_at', { ascending: false })
          .limit(1)
      : Promise.resolve({ data: null }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const replyRooms = canChat ? ((rooms ?? []) as any[]) : [];
  const unreadRooms = replyRooms.filter((r) => {
    const mine = r.chat_reads?.find((x: { user_id: string }) => x.user_id === me.id)?.last_read_at;
    return !mine || mine < r.last_message_at;
  });
  const latestReply = replyRooms[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const latestAtt = (att as any[] | null)?.[0];
  const attDone = latestAtt ? latestAtt.survey_recipients.filter((r: { responded_at: string | null }) => r.responded_at).length : 0;
  const latestPub = (anns ?? []).find((a) => a.status === 'published');
  const pubRec = latestPub?.announcement_recipients ?? [];
  const pubRate = pubRec.length ? Math.round((pubRec.filter((r) => r.read_at).length / pubRec.length) * 100) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-3 md:space-y-4">
      <h1 className="hidden text-xl font-bold md:block">ホーム</h1>
      <Notice error={error} message={message} />
      {notReady && me.role === 'admin' && (
        <Link href="/admin/setup" className="block rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950">
          <strong>⚠️ まだ使えない機能があります。</strong> データベースの追加設定が必要です。ここを押して「設定チェック」を開いてください。
        </Link>
      )}

      {/* この端末で通知を受け取っていなければ案内（受け取り中なら表示しない） */}
      <PushSetup vapidKey={env.vapidPublicKey()} compact audience="staff" />

      {canChat && (
        <Link
          href="/admin/chat?filter=reply"
          className={`surface flex items-center gap-3 rounded-2xl border-2 p-3.5 ${replyRooms.length ? 'border-red-600' : 'line'}`}
        >
          <span className={`text-[32px] leading-none font-bold ${replyRooms.length ? 'text-red-700' : 'muted'}`}>{replyRooms.length}</span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">返信が必要なチャット{unreadRooms.length > 0 && <span className="ml-1 text-sm text-red-700">（未読 {unreadRooms.length}）</span>}</span>
            <span className="muted block truncate text-xs">
              {latestReply
                ? `最新：${latestReply.profiles?.full_name ?? ''}「${latestReply.chat_messages?.[0]?.body || '写真・ファイル'}」${friendlyDateTime(latestReply.last_message_at)}`
                : 'いま返信が必要なチャットはありません'}
            </span>
          </span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        {canSurvey && (
          <Link href={latestAtt ? `/admin/surveys/${latestAtt.id}` : '/admin/surveys'} className="surface rounded-2xl border p-3">
            <span className="muted block truncate text-xs">{latestAtt ? `${latestAtt.title} の回答` : '出欠確認'}</span>
            <span className="text-2xl font-bold">
              {latestAtt ? attDone : '—'}
              {latestAtt && <span className="muted text-[13px] font-normal"> / {latestAtt.survey_recipients.length}人</span>}
            </span>
          </Link>
        )}
        {canAnnounce && (
          <Link href={latestPub ? `/admin/announcements/${latestPub.id}` : '/admin/announcements'} className="surface rounded-2xl border p-3">
            <span className="muted block text-xs">お知らせ既読（最新）</span>
            <span className="text-2xl font-bold">
              {pubRate ?? '—'}
              {pubRate !== null && <span className="muted text-[13px] font-normal">%</span>}
            </span>
          </Link>
        )}
      </div>

      {canAnnounce && (
        <LinkButton href="/admin/announcements/new" className="min-h-[52px] w-full rounded-2xl">＋ お知らせを送る</LinkButton>
      )}

      {canAnnounce && (
        <Card className="space-y-2">
          <h2 className="text-sm font-bold">最近のお知らせ</h2>
          {(anns ?? []).length === 0 && <p className="muted text-sm">まだお知らせはありません。</p>}
          <ul className="space-y-2">
            {(anns ?? []).map((a) => {
              const rec = a.announcement_recipients ?? [];
              const read = rec.filter((r) => r.read_at).length;
              return (
                <li key={a.id}>
                  <Link href={`/admin/announcements/${a.id}`} className="flex items-center gap-2 text-sm">
                    <PriorityBadge priority={a.priority} />
                    <span className="min-w-0 flex-1 truncate">{a.title}</span>
                    <span className="muted shrink-0 text-xs">
                      {a.status === 'published' ? `既読 ${read}/${rec.length}` : a.status === 'scheduled' ? `予約 ${friendlyDateTime(a.publish_at)}` : '下書き'}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
