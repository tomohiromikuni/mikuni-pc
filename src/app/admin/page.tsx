import Link from 'next/link';
import { Card, LinkButton, Notice, PageTitle, PriorityBadge, type Flash } from '@/components/ui';
import { requireStaff } from '@/lib/auth';
import { friendlyDateTime } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

export default async function Dashboard({ searchParams }: { searchParams: Promise<Flash> }) {
  await requireStaff();
  const { error, message } = await searchParams;
  const supabase = await createClient();
  const [{ data: trainees }, { data: anns }] = await Promise.all([
    supabase.from('profiles').select('status').eq('role', 'trainee'),
    supabase
      .from('announcements')
      .select('id, title, priority, status, publish_at, published_at, announcement_recipients(read_at)')
      .order('created_at', { ascending: false })
      .limit(8),
  ]);
  const count = (s: string) => (trainees ?? []).filter((t) => t.status === s).length;

  return (
    <div className="space-y-6">
      <PageTitle action={<LinkButton href="/admin/announcements/new">＋ お知らせを作成</LinkButton>}>ダッシュボード</PageTitle>
      <Notice error={error} message={message} />
      <div className="grid grid-cols-3 gap-3">
        {[
          ['利用中', count('active')],
          ['招待中', count('invited')],
          ['利用停止', count('suspended')],
        ].map(([label, n]) => (
          <Card key={label as string}>
            <p className="muted text-sm">{label}</p>
            <p className="text-3xl font-bold">{n}<span className="text-base font-normal"> 人</span></p>
          </Card>
        ))}
      </div>
      <section>
        <h2 className="mb-2 font-bold">最近のお知らせ</h2>
        <Card className="p-0">
          {(anns ?? []).length === 0 && <p className="muted p-4">まだお知らせはありません。</p>}
          <ul className="divide-y line">
            {(anns ?? []).map((a) => {
              const rec = a.announcement_recipients ?? [];
              const read = rec.filter((r) => r.read_at).length;
              return (
                <li key={a.id}>
                  <Link href={`/admin/announcements/${a.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-black/5">
                    <PriorityBadge priority={a.priority} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{a.title}</span>
                    <span className="muted text-sm">
                      {a.status === 'published'
                        ? `既読 ${read}/${rec.length}`
                        : a.status === 'scheduled'
                          ? `予約 ${friendlyDateTime(a.publish_at)}`
                          : '下書き'}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      </section>
    </div>
  );
}
