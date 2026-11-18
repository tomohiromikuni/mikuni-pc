import Link from 'next/link';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { AttachmentList } from '@/components/AttachmentList';
import { PriorityBadge } from '@/components/ui';
import { listAnnouncementAttachments } from '@/lib/attachments';
import { requireTrainee } from '@/lib/auth';
import { friendlyDateTime } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { toItem } from '@/lib/trainee-data';

export default async function AnnouncementDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireTrainee();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data }, attachments] = await Promise.all([supabase
    .from('announcements')
    .select('id, title, body, priority, published_at, edited_at, announcement_categories(name), announcement_recipients(read_at)')
    .eq('id', id)
    .maybeSingle(), listAnnouncementAttachments(id)]);
  if (!data) notFound();
  const a = toItem(data);
  // 既読の記録は画面を返した後に行う
  if (!a.read) after(async () => { await supabase.rpc('mark_announcement_read', { p_id: id }); });

  return (
    <article className="space-y-4">
      <Link href="/announcements" className="text-sm font-bold text-brand-700">‹ お知らせ一覧</Link>
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <PriorityBadge priority={a.priority} />
          {a.category && <span className="muted text-xs">{a.category}</span>}
        </div>
        <h1 className="text-xl font-bold">{a.title}</h1>
        <p className="muted text-sm">
          {friendlyDateTime(a.published_at)}
          {a.edited_at && '（編集済み）'}
        </p>
      </header>
      {a.body && <div className="surface rounded-2xl border p-4 text-[17px] whitespace-pre-wrap break-words">{a.body}</div>}
      <AttachmentList items={attachments} />
    </article>
  );
}
