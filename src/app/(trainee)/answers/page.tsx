import Link from 'next/link';
import { SurveyItem } from '@/components/SurveyItem';
import { PageTitle } from '@/components/ui';
import { requireTrainee } from '@/lib/auth';
import { listMySurveys } from '@/lib/trainee-surveys';

export default async function AnswersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireTrainee();
  const { tab } = await searchParams;
  const all = await listMySurveys();
  const todo = all.filter((s) => !s.responded_at && s.open);
  const list = tab === 'done' ? all.filter((s) => !todo.includes(s)) : todo;
  const chip = (active: boolean) => `rounded-full border px-4 py-1.5 text-sm font-bold ${active ? 'bg-brand-600 text-white border-brand-600' : 'surface'}`;
  return (
    <div>
      <PageTitle>出欠・アンケート</PageTitle>
      <div className="mb-4 flex gap-2">
        <Link href="/answers" className={chip(tab !== 'done')}>回答が必要（{todo.length}）</Link>
        <Link href="/answers?tab=done" className={chip(tab === 'done')}>回答済み・終了</Link>
      </div>
      {list.length === 0 ? (
        <p className="muted py-6 text-center">{tab === 'done' ? 'まだありません' : 'いま回答が必要なものはありません 🎉'}</p>
      ) : (
        <ul className="surface divide-y line overflow-hidden rounded-2xl border">{list.map((s) => <SurveyItem key={s.id} s={s} />)}</ul>
      )}
    </div>
  );
}
