import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SurveyAnswerForm } from '@/components/SurveyAnswerForm';
import { requireTrainee } from '@/lib/auth';
import { friendlyDateTime } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { loadQuestions } from '@/lib/surveys';

export default async function AnswerPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireTrainee();
  const { id } = await params;
  const supabase = await createClient();
  const { data: s } = await supabase.from('surveys').select('id, kind, title, description, due_at, status').eq('id', id).maybeSingle();
  if (!s) notFound();
  const [questions, { data: resp }] = await Promise.all([
    loadQuestions(id),
    supabase.from('survey_responses').select('submitted_at, updated_at, survey_answers(question_id, option_id, text_value)').eq('survey_id', id).eq('trainee_id', me.id).maybeSingle(),
  ]);
  const previous: Record<string, { optionIds: string[]; text: string }> = {};
  for (const a of resp?.survey_answers ?? []) {
    previous[a.question_id] ??= { optionIds: [], text: '' };
    if (a.option_id) previous[a.question_id].optionIds.push(a.option_id);
    if (a.text_value) previous[a.question_id].text = a.text_value;
  }
  const open = s.status === 'published' && (!s.due_at || new Date(s.due_at) > new Date());

  return (
    <div className="space-y-4">
      <Link href="/answers" className="text-sm font-bold text-brand-700">‹ 出欠・アンケート一覧</Link>
      <h1 className="text-xl font-bold">{s.title}</h1>
      <p className="muted text-sm">
        {open ? (s.due_at ? `回答期限：${friendlyDateTime(s.due_at)}` : '回答期限：なし') : '受付は終了しました'}
        {resp && `・回答済み（${friendlyDateTime(resp.updated_at)}）`}
      </p>
      {s.description && <p className="whitespace-pre-wrap">{s.description}</p>}
      {open && resp && <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-700">期限までは回答を修正できます。</p>}
      <SurveyAnswerForm surveyId={id} questions={questions} previous={previous} attendance={s.kind === 'attendance'} readOnly={!open} />
    </div>
  );
}
