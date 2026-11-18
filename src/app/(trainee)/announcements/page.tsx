import Link from 'next/link';
import { AnnouncementList } from '@/components/AnnouncementList';
import { PageTitle } from '@/components/ui';
import { requireTrainee } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { listMyAnnouncements } from '@/lib/trainee-data';

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  await requireTrainee();
  const { c } = await searchParams;
  const supabase = await createClient();
  const { data: categories } = await supabase.from('announcement_categories').select('id, name').order('sort_order');
  const items = await listMyAnnouncements({ categoryId: c });

  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-4 py-1.5 text-sm font-bold ${active ? 'bg-brand-600 text-white border-brand-600' : 'surface'}`;

  return (
    <div>
      <PageTitle>お知らせ</PageTitle>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href="/announcements" className={chip(!c)}>すべて</Link>
        {(categories ?? []).map((cat) => (
          <Link key={cat.id} href={`/announcements?c=${cat.id}`} className={chip(c === cat.id)}>
            {cat.name}
          </Link>
        ))}
      </div>
      <AnnouncementList items={items} />
    </div>
  );
}
