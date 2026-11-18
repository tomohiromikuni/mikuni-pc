'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin, requirePerm } from '@/lib/auth';
import { jstLocalToIso } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { parseTargetValues } from '@/lib/targets-parse';

const ATTENDANCE_OPTIONS = ['出席', '欠席', '遅刻'];

const payloadSchema = z.object({
  kind: z.enum(['attendance', 'survey']),
  title: z.string().trim().min(1, 'タイトルを入力してください').max(200),
  description: z.string().max(4000).default(''),
  target_date: z.string().default(''),
  due_local: z.string().default(''),
  targets: z.array(z.string()),
  mode: z.enum(['now', 'draft']),
  questions: z
    .array(
      z.object({
        kind: z.enum(['single', 'multi', 'text']),
        label: z.string().trim().min(1, '質問文が空の質問があります').max(500),
        required: z.boolean(),
        options: z.array(z.string().trim().min(1).max(200)).max(30),
      }),
    )
    .max(50),
});
export type SurveyPayload = z.input<typeof payloadSchema>;

export async function createSurvey(input: SurveyPayload): Promise<{ error?: string; url?: string }> {
  const me = await requirePerm('survey');
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const p = parsed.data;
  const targets = parseTargetValues(p.targets);
  if (p.mode === 'now' && targets.length === 0) return { error: '宛先を選んでください' };
  const due = jstLocalToIso(p.due_local);
  if (p.due_local && (!due || new Date(due) <= new Date())) return { error: '回答期限は現在より後の日時にしてください' };

  const questions =
    p.kind === 'attendance'
      ? [
          { kind: 'single' as const, label: p.target_date ? `${p.target_date.replaceAll('-', '/')} の出欠` : '出欠', required: true, options: ATTENDANCE_OPTIONS },
          { kind: 'text' as const, label: '連絡事項（欠席・遅刻の理由など）', required: false, options: [] },
        ]
      : p.questions;
  if (questions.length === 0) return { error: '質問を1つ以上作ってください' };
  for (const q of questions) if (q.kind !== 'text' && q.options.length < 2) return { error: `「${q.label}」の選択肢を2つ以上入力してください` };

  const supabase = await createClient();
  const { data: s, error } = await supabase
    .from('surveys')
    .insert({ org_id: me.org_id, kind: p.kind, title: p.title, description: p.description, target_date: p.target_date || null, due_at: due, created_by: me.id })
    .select('id')
    .single();
  if (error || !s) return { error: '保存できませんでした：' + error?.message };
  const fail = async (msg: string) => {
    await supabase.from('surveys').delete().eq('id', s.id);
    return { error: msg };
  };
  for (const [i, q] of questions.entries()) {
    const { data: qq, error: qe } = await supabase
      .from('survey_questions')
      .insert({ survey_id: s.id, position: i, kind: q.kind, label: q.label, required: q.required })
      .select('id')
      .single();
    if (qe || !qq) return fail('質問を保存できませんでした：' + qe?.message);
    if (q.kind !== 'text') {
      const { error: oe } = await supabase.from('survey_options').insert(q.options.map((label, j) => ({ question_id: qq.id, position: j, label })));
      if (oe) return fail('選択肢を保存できませんでした：' + oe.message);
    }
  }
  if (targets.length) {
    const { error: te } = await supabase.from('survey_targets').insert(targets.map((t) => ({ ...t, survey_id: s.id })));
    if (te) return fail('担当範囲外の宛先が含まれているため保存できませんでした');
  }
  let msg = '下書きを保存しました';
  if (p.mode === 'now') {
    const { data: n, error: pe } = await supabase.rpc('publish_survey', { p_id: s.id });
    if (pe) return { url: `/admin/surveys/${s.id}?error=` + encodeURIComponent('配信できませんでした：' + pe.message) };
    msg = `${n}人に配信しました`;
  }
  revalidatePath('/admin/surveys');
  return { url: `/admin/surveys/${s.id}?message=` + encodeURIComponent(msg) };
}

export async function publishSurvey(id: string) {
  await requirePerm('survey');
  const supabase = await createClient();
  const { data: n, error } = await supabase.rpc('publish_survey', { p_id: id });
  if (error) redirect(`/admin/surveys/${id}?error=` + encodeURIComponent(error.message));
  revalidatePath(`/admin/surveys/${id}`);
  redirect(`/admin/surveys/${id}?message=` + encodeURIComponent(`${n}人に配信しました`));
}

export async function setSurveyClosed(id: string, closed: boolean) {
  await requirePerm('survey');
  const supabase = await createClient();
  const { error } = await supabase.from('surveys').update({ status: closed ? 'closed' : 'published', ...(closed ? {} : { due_at: null }) }).eq('id', id);
  if (error) redirect(`/admin/surveys/${id}?error=` + encodeURIComponent(error.message));
  revalidatePath(`/admin/surveys/${id}`);
  redirect(`/admin/surveys/${id}?message=` + encodeURIComponent(closed ? '受付を締め切りました' : '受付を再開しました（期限なし）'));
}

export async function deleteSurvey(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from('surveys').delete().eq('id', id);
  revalidatePath('/admin/surveys');
  redirect('/admin/surveys?message=' + encodeURIComponent('削除しました'));
}
