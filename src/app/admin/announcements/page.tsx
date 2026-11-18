import Link from 'next/link';
import { Card, LinkButton, Notice, PageTitle, PriorityBadge, type Flash } from '@/components/ui';
import { hasPerm, requireStaff } from '@/lib/auth';
import { friendlyDateTime } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

const TABS = [
  ['published', '配信済み'],
  ['scheduled', '予約中'],
  ['draft', '下書き'],
] as const;

export default async function AdminAnnouncements({ searchParams }: { searchParams: Promise<Flash & { tab?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : 'published';
  const canAnnounce = await hasPerm('announce');
  const supabase = await createClient();
  const { data } = await supabase
    .from('announcements')
    .select('id, title, priority, status, publish_at, published_at, created_at, announcement_categories(name), announcement_recipients(read_at), profiles!announcements_created_by_fkey(full_name)')
    .eq('status', tab)
    .order(tab === 'published' ? 'published_at' : 'created_at', { ascending: false })
    .limit(100);

  return (
    <div className="space-y-4">
      <PageTitle action={canAnnounce && <LinkButton href="/admin/announcements/new">＋ お知らせを作成</LinkButton>}>お知らせ</PageTitle>
      <Notice error={sp.error} message={sp.message} />
      {!canAnnounce && <Notice error="お知らせを配信する権限がありません。管理者に依頼してください。" />}
      <div className="flex gap-2">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/admin/announcements?tab=${k}`} className={`rounded-full border px-4 py-1.5 text-sm font-bold ${tab === k ? 'border-brand-600 bg-brand-600 text-white' : 'surface'}`}>
            {label}
          </Link>
        ))}
      </div>
      <Card className="p-0">
        <ul className="divide-y line">
          {(data ?? []).map((a) => {
            const rec = a.announcement_recipients ?? [];
            const read = rec.filter((r) => r.read_at).length;
            const pct = rec.length ? Math.round((read / rec.length) * 100) : 0;
            return (
              <li key={a.id}>
                <Link href={`/admin/announcements/${a.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-black/5">
                  <PriorityBadge priority={a.priority} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{a.title}</span>
                    <span className="muted text-xs">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(a.announcement_categories as any)?.name ?? 'カテゴリーなし'}・作成 {(a.profiles as any)?.full_name ?? ''}
                    </span>
                  </span>
                  <span className="muted text-right text-sm">
                    {tab === 'published' && (
                      <>
                        {friendlyDateTime(a.published_at)}
                        <br />既読 {read}/{rec.length}（{pct}%）
                      </>
                    )}
                    {tab === 'scheduled' && <>予約：{friendlyDateTime(a.publish_at)}</>}
                    {tab === 'draft' && <>作成：{friendlyDateTime(a.created_at)}</>}
                  </span>
                </Link>
              </li>
            );
          })}
          {(data ?? []).length === 0 && <li className="muted p-6 text-center">ありません</li>}
        </ul>
      </Card>
    </div>
  );
}
