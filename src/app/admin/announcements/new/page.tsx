import Link from 'next/link';
import { AnnouncementComposer } from '@/components/AnnouncementComposer';
import { Notice, PageTitle, type Flash } from '@/components/ui';
import { requirePerm } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getTargetOptions } from '@/lib/targets';

export default async function NewAnnouncementPage({ searchParams }: { searchParams: Promise<Flash> }) {
  await requirePerm('announce');
  const { error } = await searchParams;
  const supabase = await createClient();
  const [targets, { data: enr }] = await Promise.all([
    getTargetOptions(),
    // 宛先ごとの人数（ボタンに「17人に送る」と出すため）
    supabase.from('enrollments').select('classes!inner(course_id), profiles!inner(role, status)').is('ended_on', null).eq('profiles.status', 'active'),
  ]);
  const count = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (enr ?? []) as any[]) count.set(e.classes.course_id, (count.get(e.classes.course_id) ?? 0) + 1);
  const courses = targets.courses.map((c) => ({ ...c, count: count.get(c.id) ?? 0 }));

  return (
    <div className="space-y-4">
      <Link href="/admin/announcements" className="text-sm font-bold text-brand-700">‹ お知らせ一覧</Link>
      <PageTitle>お知らせを作成</PageTitle>
      <Notice error={error} />
      <AnnouncementComposer targets={{ all: targets.all, total: courses.reduce((n, c) => n + c.count, 0), courses }} />
    </div>
  );
}
