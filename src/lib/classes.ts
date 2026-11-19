import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type ClassOption = { id: string; label: string; courseId: string; courseName: string; name: string };

/**
 * 選択肢用：受講中の「期」の一覧（クラスは使わない運用）。
 * 各期の中の最初のクラス（自動で作られる「全体」）を、その期の所属先として使う。
 */
export async function getClassOptions(): Promise<ClassOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('classes')
    .select('id, name, course_id, created_at, courses!inner(name, archived, starts_on)')
    .eq('archived', false)
    .eq('courses.archived', false)
    .order('created_at');
  const byCourse = new Map<string, ClassOption & { startsOn: string }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const k of (data ?? []) as any[]) {
    if (byCourse.has(k.course_id)) continue;
    byCourse.set(k.course_id, { id: k.id, name: k.courses.name, courseId: k.course_id, courseName: k.courses.name, label: k.courses.name, startsOn: k.courses.starts_on ?? '' });
  }
  // 新しい期が先
  return [...byCourse.values()].sort((a, b) => b.startsOn.localeCompare(a.startsOn)).map(({ startsOn: _s, ...o }) => o);
}
