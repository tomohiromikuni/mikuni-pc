import Link from 'next/link';
import { Card, LinkButton, Notice, PageTitle, type Flash } from '@/components/ui';
import { hasPerm, requireStaff } from '@/lib/auth';
import { friendlyDateTime } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

const TABS: [string, string][] = [['published', '受付中'], ['closed', '締切'], ['draft', '下書き']];

export default async function SurveysPage({ searchParams }: { searchParams: Promise<Flash & { tab?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : 'published';
  const canSurvey = await hasPerm('survey');
  const supabase = await createClient();
  const { data } = await supabase
    .from('surveys')
    .select('id, kind, title, due_at, published_at, created_at, survey_recipients(responded_at)')
    .eq('status', tab)
    .order(tab === 'draft' ? 'created_at' : 'published_at', { ascending: false })
    .limit(100);
  return (
    <div className="space-y-4">
      <PageTitle
        action={canSurvey && (
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/admin/surveys/new?kind=attendance">＋ 出欠確認</LinkButton>
            <LinkButton href="/admin/surveys/new?kind=survey" variant="secondary">＋ アンケート</LinkButton>
          </div>
        )}
      >
        出欠・アンケート
      </PageTitle>
      <Notice error={sp.error} message={sp.message} />
      {!canSurvey && <Notice error="出欠・アンケートの権限がありません。管理者に依頼してください。" />}
      <div className="flex gap-2">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/admin/surveys?tab=${k}`} className={`rounded-full border px-4 py-1.5 text-sm font-bold ${tab === k ? 'border-brand-600 bg-brand-600 text-white' : 'surface'}`}>{label}</Link>
        ))}
      </div>
      <Card className="p-0">
        <ul className="divide-y line">
          {(data ?? []).map((s) => {
            const rec = s.survey_recipients ?? [];
            const done = rec.filter((r) => r.responded_at).length;
            return (
              <li key={s.id}>
                <Link href={`/admin/surveys/${s.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-black/5">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${s.kind === 'attendance' ? 'bg-sky-100 text-sky-800' : 'bg-violet-100 text-violet-800'}`}>{s.kind === 'attendance' ? '出欠' : 'アンケート'}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{s.title}</span>
                  <span className="muted text-right text-sm">
                    {tab !== 'draft' ? <>回答 {done}/{rec.length}{s.due_at && <><br />期限 {friendlyDateTime(s.due_at)}</>}</> : <>作成 {friendlyDateTime(s.created_at)}</>}
                  </span>
                </Link>
              </li>
            );
          })}
          {(data ?? []).length === 0 && <li className="muted p-6 text-center">ありません</li>}
        </ul>
      </Card>
    </div>
  );
}
