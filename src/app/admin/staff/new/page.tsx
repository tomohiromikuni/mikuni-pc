import Link from 'next/link';
import { StaffFields } from '@/components/StaffFields';
import { Button, Card, Notice, PageTitle, type Flash } from '@/components/ui';
import { requireAdmin } from '@/lib/auth';
import { getClassOptions } from '@/lib/classes';
import { createStaff } from '../actions';

export default async function NewStaffPage({ searchParams }: { searchParams: Promise<Flash> }) {
  await requireAdmin();
  const { error } = await searchParams;
  const classes = await getClassOptions();
  return (
    <div className="space-y-4">
      <Link href="/admin/staff" className="text-sm font-bold text-brand-700">‹ スタッフ一覧</Link>
      <PageTitle>スタッフを追加</PageTitle>
      <Notice error={error} />
      <Card>
        <form action={createStaff} className="space-y-5">
          <StaffFields classes={classes} isNew />
          <Button type="submit">登録する</Button>
        </form>
      </Card>
    </div>
  );
}
