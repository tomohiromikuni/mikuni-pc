import Link from 'next/link';
import { ImportWizard } from '@/components/ImportWizard';
import { PageTitle } from '@/components/ui';
import { requirePerm } from '@/lib/auth';
import { getClassOptions } from '@/lib/classes';

export default async function ImportPage() {
  await requirePerm('manage_trainees');
  const classes = (await getClassOptions()).map((c) => ({ id: c.id, courseName: c.courseName, name: c.name }));
  return (
    <div className="space-y-4">
      <Link href="/admin/trainees" className="text-sm font-bold text-brand-700">‹ 訓練生一覧</Link>
      <PageTitle>Excel・CSVで一括登録</PageTitle>
      <ImportWizard classes={classes} />
    </div>
  );
}
