import Link from 'next/link';
import { TraineeForm } from '@/components/TraineeForm';
import { Card, Notice, PageTitle, type Flash } from '@/components/ui';
import { requirePerm } from '@/lib/auth';
import { getClassOptions } from '@/lib/classes';
import { createTrainee } from '../actions';

export default async function NewTraineePage({ searchParams }: { searchParams: Promise<Flash> }) {
  await requirePerm('manage_trainees');
  const { error } = await searchParams;
  const classes = await getClassOptions();
  return (
    <div className="space-y-4">
      <Link href="/admin/trainees" className="text-sm font-bold text-brand-700">‹ 訓練生一覧</Link>
      <PageTitle>訓練生を登録</PageTitle>
      <Notice error={error} />
      <Card>
        <TraineeForm action={createTrainee} classes={classes} submitLabel="登録する" />
      </Card>
      <p className="muted text-sm">Excel・CSVでの一括登録は開発段階2で追加予定です。</p>
    </div>
  );
}
