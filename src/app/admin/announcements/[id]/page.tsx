import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AnnouncementFields } from '@/components/AnnouncementFields';
import { AttachmentList } from '@/components/AttachmentList';
import { AttachmentManager } from '@/components/AttachmentManager';
import { listAnnouncementAttachments } from '@/lib/attachments';
import { Button, Card, Notice, PageTitle, type Flash } from '@/components/ui';
import { requirePerm } from '@/lib/auth';
import { friendlyDateTime } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { cancelSchedule, deleteAnnouncement, editAnnouncement, publishNow, remindAnnouncement } from '../actions';

export default async function AdminAnnouncementDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Flash & { filter?: string }> }) {
  const me = await requirePerm('announce');
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: a }] = await Promise.all([
    supabase
      .from('announcements')
      .select('*, announcement_targets(target_type, courses(name), classes(name, courses(name))), announcement_recipients(read_at, trainee_id, profiles(full_name, full_name_kana))')
      .eq('id', id)
      .maybeSingle(),
  ]);
  if (!a) notFound();
  const attachments = await listAnnouncementAttachments(id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const targets = (a.announcement_targets ?? []).map((t: any) =>
    t.target_type === 'all' ? '全訓練生' : t.target_type === 'course' ? `${t.courses?.name}（コース全体）` : `${t.classes?.courses?.name} / ${t.classes?.name}`,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recipients = (a.announcement_recipients ?? []).map((r: any) => ({ id: r.trainee_id, name: r.profiles?.full_name ?? '', kana: r.profiles?.full_name_kana ?? '', read_at: r.read_at as string | null }))
    .sort((x: { kana: string }, y: { kana: string }) => x.kana.localeCompare(y.kana, 'ja'));
  const readCount = recipients.filter((r: { read_at: string | null }) => r.read_at).length;
  const shown = sp.filter === 'unread' ? recipients.filter((r: { read_at: string | null }) => !r.read_at) : recipients;
  const canEdit = me.role === 'admin' || a.created_by === me.id;

  return (
    <div className="space-y-6">
      <Link href="/admin/announcements" className="text-sm font-bold text-brand-700">‹ お知らせ一覧</Link>
      <PageTitle>
        {a.title}
      </PageTitle>
      <Notice error={sp.error} message={sp.message} />

      <Card className="space-y-2">
        <p>
          <strong>状態：</strong>
          {a.status === 'published' && `配信済み（${friendlyDateTime(a.published_at)}）${a.edited_at ? '・編集済み' : ''}`}
          {a.status === 'scheduled' && `予約中（${friendlyDateTime(a.publish_at)} に配信）`}
          {a.status === 'draft' && '下書き'}
        </p>
        <p><strong>宛先：</strong>{targets.join('、') || '未設定'}</p>
        {canEdit && a.status !== 'published' && (
          <div className="flex flex-wrap gap-2 pt-2">
            {targets.length > 0 && (
              <form action={publishNow.bind(null, id)}><Button type="submit">今すぐ配信</Button></form>
            )}
            {a.status === 'scheduled' && (
              <form action={cancelSchedule.bind(null, id)}><Button type="submit" variant="secondary">予約を取り消す</Button></form>
            )}
          </div>
        )}
      </Card>

      {a.status === 'published' && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">既読状況：{readCount} / {recipients.length} 人（{recipients.length ? Math.round((readCount / recipients.length) * 100) : 0}%）</h2>
            <div className="flex gap-3 text-sm">
              <Link href={`/admin/announcements/${id}`} className={sp.filter !== 'unread' ? 'font-bold underline' : 'text-brand-700'}>全員</Link>
              <Link href={`/admin/announcements/${id}?filter=unread`} className={sp.filter === 'unread' ? 'font-bold underline' : 'text-brand-700'}>未読の人だけ</Link>
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-black/10">
            <div className="h-full bg-brand-500" style={{ width: `${recipients.length ? (readCount / recipients.length) * 100 : 0}%` }} />
          </div>
          <ul className="mt-3 grid gap-x-6 sm:grid-cols-2">
            {shown.map((r: { id: string; name: string; read_at: string | null }) => (
              <li key={r.id} className="flex justify-between border-b line py-1.5 text-sm">
                <Link href={`/admin/trainees/${r.id}`} className="hover:underline">{r.name}</Link>
                <span className={r.read_at ? 'muted' : 'font-bold text-red-700'}>{r.read_at ? friendlyDateTime(r.read_at) : '未読'}</span>
              </li>
            ))}
          </ul>
          {readCount < recipients.length && (
            <form action={remindAnnouncement.bind(null, id)} className="mt-3">
              <Button type="submit" variant="secondary">未読の人に再通知する</Button>
            </form>
          )}
          <p className="muted mt-2 text-xs">表示されるのは、あなたの担当範囲の訓練生だけです。</p>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 font-bold">添付ファイル（{attachments.length}件）</h2>
        {canEdit ? (
          <AttachmentManager items={attachments} orgId={a.org_id} announcementId={id} />
        ) : (
          <AttachmentList items={attachments} />
        )}
      </Card>

      {canEdit && (
        <Card>
          <details>
            <summary className="cursor-pointer font-bold">内容を編集する</summary>
            <form action={editAnnouncement.bind(null, id)} className="mt-4 space-y-4">
              <AnnouncementFields values={a} />
              {a.status === 'published' && <p className="muted text-xs">配信済みのお知らせを編集すると、訓練生の画面に「編集済み」と表示されます。</p>}
              <Button type="submit">保存</Button>
            </form>
          </details>
        </Card>
      )}

      {!canEdit && (
        <Card><p className="whitespace-pre-wrap">{a.body}</p></Card>
      )}

      {me.role === 'admin' && (
        <form action={deleteAnnouncement.bind(null, id)}>
          <button className="text-sm text-red-700 underline">このお知らせを削除する（元に戻せません）</button>
        </form>
      )}
    </div>
  );
}
