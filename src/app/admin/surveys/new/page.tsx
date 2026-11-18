import Link from 'next/link';
import { SurveyBuilder } from '@/components/SurveyBuilder';
import { TargetPicker } from '@/components/TargetPicker';
import { PageTitle } from '@/components/ui';
import { requirePerm } from '@/lib/auth';
import { getTargetOptions } from '@/lib/targets';

export default async function NewSurveyPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requirePerm('survey');
  const { kind: k } = await searchParams;
  const kind = k === 'survey' ? 'survey' : 'attendance';
  const targets = await getTargetOptions();
  // 既定の対象日：明日（日本時間）
  const tomorrow = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date(Date.now() + 86400000));
  return (
    <div className="space-y-4">
      <Link href="/admin/surveys" className="text-sm font-bold text-brand-700">‹ 出欠・アンケート一覧</Link>
      <PageTitle>{kind === 'attendance' ? '出欠確認を作成' : 'アンケートを作成'}</PageTitle>
      <div className="flex gap-2 text-sm">
        <Link href="/admin/surveys/new?kind=attendance" className={`rounded-full border px-4 py-1.5 font-bold ${kind === 'attendance' ? 'border-brand-600 bg-brand-600 text-white' : 'surface'}`}>出欠確認</Link>
        <Link href="/admin/surveys/new?kind=survey" className={`rounded-full border px-4 py-1.5 font-bold ${kind === 'survey' ? 'border-brand-600 bg-brand-600 text-white' : 'surface'}`}>アンケート</Link>
      </div>
      <SurveyBuilder key={kind} kind={kind} defaultDate={tomorrow} targetPicker={<TargetPicker targets={targets} />} />
    </div>
  );
}
