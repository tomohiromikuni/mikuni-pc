import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type Question = { id: string; position: number; kind: 'single' | 'multi' | 'text'; label: string; required: boolean; options: { id: string; label: string }[] };

export async function loadQuestions(surveyId: string): Promise<Question[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('survey_questions')
    .select('id, position, kind, label, required, survey_options(id, label, position)')
    .eq('survey_id', surveyId)
    .order('position');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((q: any) => ({
    ...q,
    options: [...(q.survey_options ?? [])].sort((a, b) => a.position - b.position).map(({ id, label }) => ({ id, label })),
  }));
}

export type PersonResult = {
  traineeId: string;
  name: string;
  kana: string;
  classLabel: string;
  respondedAt: string | null;
  answers: Record<string, { optionIds: string[]; text: string }>;
};

/** 集計（見えるのは担当範囲の訓練生の分だけ） */
export async function loadSurveyResults(surveyId: string) {
  const supabase = await createClient();
  const questions = await loadQuestions(surveyId);
  const [{ data: recips }, { data: responses }] = await Promise.all([
    supabase
      .from('survey_recipients')
      .select('trainee_id, responded_at, profiles(full_name, full_name_kana, enrollments(ended_on, classes(name, courses(name))))')
      .eq('survey_id', surveyId),
    supabase.from('survey_responses').select('trainee_id, survey_answers(question_id, option_id, text_value)').eq('survey_id', surveyId),
  ]);
  const ansByTrainee = new Map<string, PersonResult['answers']>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (responses ?? []) as any[]) {
    const m: PersonResult['answers'] = {};
    for (const a of r.survey_answers ?? []) {
      m[a.question_id] ??= { optionIds: [], text: '' };
      if (a.option_id) m[a.question_id].optionIds.push(a.option_id);
      if (a.text_value) m[a.question_id].text = a.text_value;
    }
    ansByTrainee.set(r.trainee_id, m);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const people: PersonResult[] = ((recips ?? []) as any[]).map((r) => {
    const cur = (r.profiles?.enrollments ?? []).find((e: { ended_on: string | null }) => !e.ended_on);
    return {
      traineeId: r.trainee_id,
      name: r.profiles?.full_name ?? '',
      kana: r.profiles?.full_name_kana ?? '',
      classLabel: cur ? cur.classes.courses.name : '未所属',
      respondedAt: r.responded_at,
      answers: ansByTrainee.get(r.trainee_id) ?? {},
    };
  }).sort((a, b) => a.kana.localeCompare(b.kana, 'ja'));

  const counts = new Map<string, number>();
  for (const p of people) for (const a of Object.values(p.answers)) for (const o of a.optionIds) counts.set(o, (counts.get(o) ?? 0) + 1);
  return { questions, people, counts };
}

export function answerText(q: Question, a: { optionIds: string[]; text: string } | undefined): string {
  if (!a) return '';
  if (q.kind === 'text') return a.text;
  return a.optionIds.map((id) => q.options.find((o) => o.id === id)?.label ?? '').join('、');
}
