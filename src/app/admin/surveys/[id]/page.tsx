import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button, Card, LinkButton, Notice, PageTitle, type Flash } from '@/components/ui';
import { requirePerm } from '@/lib/auth';
import { friendlyDateTime } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { answerText, loadSurveyResults } from '@/lib/surveys';
import { deleteSurvey, publishSurvey, setSurveyClosed } from '../actions';

const BAR_COLORS = ['bg-brand-500', 'bg-red-500', 'bg-amber-400', 'bg-sky-500', 'bg-violet-500', 'bg-pink-500'];

export default async function SurveyDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Flash & { view?: string }> }) {
  const me = await requirePerm('survey');
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: s } = await supabase.from('surveys').select('*, survey_targets(target_type, courses(name), classes(name, courses(name)))').eq('id', id).maybeSingle();
  if (!s) notFound();
  const { questions, people, counts } = await loadSurveyResults(id);
  const done = people.filter((p) => p.respondedAt);
  const pending = people.filter((p) => !p.respondedAt);
  const canEdit = me.role === 'admin' || s.created_by === me.id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const targets = (s.survey_targets ?? []).map((t: any) => t.target_type === 'all' ? '全訓練生' : t.target_type === 'course' ? `${t.courses?.name}（コース全体）` : `${t.classes?.courses?.name} / ${t.classes?.name}`);
  const pct = people.length ? Math.round((done.length / people.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <Link href="/admin/surveys" className="text-sm font-bold text-brand-700">‹ 出欠・アンケート一覧</Link>
      <PageTitle>{s.title}</PageTitle>
      <Notice error={sp.error} message={sp.message} />

      <Card className="space-y-2">
        <p><strong>状態：</strong>{s.status === 'draft' ? '下書き' : s.status === 'published' ? '受付中' : '締切'}{s.due_at && `（期限 ${friendlyDateTime(s.due_at)}）`}</p>
        <p><strong>宛先：</strong>{targets.join('、') || '未設定'}</p>
        {s.description && <p className="whitespace-pre-wrap text-sm">{s.description}</p>}
        {canEdit && (
          <div className="flex flex-wrap gap-2 pt-2">
            {s.status === 'draft' && <form action={publishSurvey.bind(null, id)}><Button type="submit">配信する</Button></form>}
            {s.status === 'published' && <form action={setSurveyClosed.bind(null, id, true)}><Button type="submit" variant="secondary">受付を締め切る</Button></form>}
            {s.status === 'closed' && <form action={setSurveyClosed.bind(null, id, false)}><Button type="submit" variant="secondary">受付を再開する</Button></form>}
            {s.status !== 'draft' && <LinkButton href={`/admin/surveys/${id}/csv`} variant="secondary" prefetch={false}>結果をCSVで保存</LinkButton>}
          </div>
        )}
      </Card>

      {s.status !== 'draft' && (
        <>
          <Card>
            <h2 className="mb-2 font-bold">回答状況：{done.length} / {people.length} 人（{pct}%）</h2>
            <div className="h-3 overflow-hidden rounded-full bg-black/10"><div className="h-full bg-brand-500" style={{ width: `${pct}%` }} /></div>
            {pending.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-1 font-bold text-red-700">未回答（{pending.length}人）</h3>
                <ul className="flex flex-wrap gap-2 text-sm">
                  {pending.map((p) => (
                    <li key={p.traineeId}><Link href={`/admin/trainees/${p.traineeId}`} className="rounded-full bg-red-50 px-3 py-1 text-red-800 hover:underline">{p.name}</Link></li>
                  ))}
                </ul>
                <p className="muted mt-2 text-xs">未回答者への再通知は、通知機能の設定後に使えます。</p>
              </div>
            )}
          </Card>

          {questions.map((q, qi) => {
            const answered = done.filter((p) => p.answers[q.id]);
            return (
              <Card key={q.id}>
                <h2 className="mb-3 font-bold">Q{qi + 1}. {q.label}</h2>
                {q.kind === 'text' ? (
                  <ul className="divide-y line text-sm">
                    {answered.filter((p) => p.answers[q.id]?.text).map((p) => (
                      <li key={p.traineeId} className="py-2"><span className="font-semibold">{p.name}</span>：<span className="whitespace-pre-wrap">{p.answers[q.id].text}</span></li>
                    ))}
                    {answered.filter((p) => p.answers[q.id]?.text).length === 0 && <li className="muted py-2">記入はありません</li>}
                  </ul>
                ) : (
                  <div className="space-y-2">
                    {q.options.map((o, i) => {
                      const n = counts.get(o.id) ?? 0;
                      const w = done.length ? (n / done.length) * 100 : 0;
                      const names = done.filter((p) => p.answers[q.id]?.optionIds.includes(o.id)).map((p) => p.name);
                      return (
                        <div key={o.id}>
                          <div className="flex justify-between text-sm"><span className="font-semibold">{o.label}</span><span>{n}人（{Math.round(w)}%）</span></div>
                          <div className="h-5 overflow-hidden rounded-md bg-black/5"><div className={`h-full ${BAR_COLORS[i % BAR_COLORS.length]}`} style={{ width: `${w}%` }} /></div>
                          {names.length > 0 && <p className="muted mt-0.5 text-xs">{names.join('、')}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}

          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="muted"><tr className="border-b line"><th className="px-3 py-2">氏名</th><th className="px-3 py-2">所属</th>{questions.map((q, i) => <th key={q.id} className="px-3 py-2">Q{i + 1}</th>)}<th className="px-3 py-2">回答日時</th></tr></thead>
              <tbody className="divide-y line">
                {people.map((p) => (
                  <tr key={p.traineeId} className={p.respondedAt ? '' : 'bg-red-50 text-red-950'}>
                    <td className="px-3 py-2">{p.name}</td>
                    <td className="px-3 py-2">{p.classLabel}</td>
                    {questions.map((q) => <td key={q.id} className="px-3 py-2">{answerText(q, p.answers[q.id])}</td>)}
                    <td className="px-3 py-2 whitespace-nowrap">{p.respondedAt ? friendlyDateTime(p.respondedAt) : '未回答'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="muted text-xs">表示されるのは、あなたの担当範囲の訓練生だけです。</p>
        </>
      )}

      {me.role === 'admin' && (
        <form action={deleteSurvey.bind(null, id)}>
          <button className="text-sm text-red-700 underline">削除する（回答も消えます。元に戻せません）</button>
        </form>
      )}
    </div>
  );
}
