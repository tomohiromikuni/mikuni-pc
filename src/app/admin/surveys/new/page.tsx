import Link from 'next/link';
import { SurveyBuilder } from '@/components/SurveyBuilder';
import { TargetPicker } from '@/components/TargetPicker';
import { PageTitle } from '@/components/ui';
import { requirePerm } from '@/lib/auth';
import { getTargetOptions } from '@/lib/targets';

export default async function NewSurveyPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requirePerm('survey');
  const { kind: k } = await searchParams;
  const preset = k === 'employment' ? 'employment' : undefined;
  const kind = k === 'survey' || preset ? 'survey' : 'attendance';
  const targets = await getTargetOptions();
  // 既定の対象日：明日（日本時間）
  const tomorrow = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date(Date.now() + 86400000));
  return (
    <div className="space-y-4">
      <Link href="/admin/surveys" className="text-sm font-bold text-brand-700">‹ 出欠・アンケート一覧</Link>
      <PageTitle>{kind === 'attendance' ? '出欠確認を作成' : preset ? '就職状況の確認を作成' : 'アンケートを作成'}</PageTitle>
      <div className="flex gap-2 text-sm">
        <Link href="/admin/surveys/new?kind=attendance" className={`rounded-full border px-4 py-1.5 font-bold ${kind === 'attendance' ? 'border-brand-600 bg-brand-600 text-white' : 'surface'}`}>出欠確認</Link>
        <Link href="/admin/surveys/new?kind=survey" className={`rounded-full border px-4 py-1.5 font-bold ${kind === 'survey' && !preset ? 'border-brand-600 bg-brand-600 text-white' : 'surface'}`}>アンケート</Link>
        <Link href="/admin/surveys/new?kind=employment" className={`rounded-full border px-4 py-1.5 font-bold ${preset ? 'border-amber-600 bg-amber-500 text-[#1f2a26]' : 'surface'}`}>就職状況の確認（修了生あて）</Link>
      </div>
      <SurveyBuilder key={k ?? 'attendance'} kind={kind} preset={preset} defaultDate={tomorrow} targetPicker={<TargetPicker targets={targets} finishedFirst={!!preset} />} />
    </div>
  );
}
