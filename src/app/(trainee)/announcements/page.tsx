import { AnnouncementList } from '@/components/AnnouncementList';
import { PageTitle } from '@/components/ui';
import { requireTrainee } from '@/lib/auth';
import { listMyAnnouncements } from '@/lib/trainee-data';

export default async function AnnouncementsPage() {
  await requireTrainee();
  const items = await listMyAnnouncements();
  return (
    <div>
      <PageTitle>お知らせ</PageTitle>
      <AnnouncementList items={items} />
    </div>
  );
}
