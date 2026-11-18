import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type MySurvey = { id: string; kind: 'attendance' | 'survey'; title: string; due_at: string | null; status: string; responded_at: string | null; open: boolean };

/** 自分あての出欠・アンケート（新しい順） */
export async function listMySurveys(): Promise<MySurvey[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from('survey_recipients')
    .select('responded_at, surveys!inner(id, kind, title, due_at, status, published_at)')
    .eq('trainee_id', user.id)
    .order('published_at', { referencedTable: 'surveys', ascending: false })
    .limit(200);
  const now = new Date();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[])
    .map((r) => ({
      id: r.surveys.id,
      kind: r.surveys.kind,
      title: r.surveys.title,
      due_at: r.surveys.due_at,
      status: r.surveys.status,
      responded_at: r.responded_at,
      published_at: r.surveys.published_at,
      open: r.surveys.status === 'published' && (!r.surveys.due_at || new Date(r.surveys.due_at) > now),
    }))
    .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));
}
