import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type ClassOption = { id: string; label: string; courseId: string; courseName: string; name: string };

/** 選択肢用：アーカイブされていないクラス（「コース / クラス」の表示名つき） */
export async function getClassOptions(): Promise<ClassOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('classes')
    .select('id, name, course_id, courses!inner(name, archived)')
    .eq('archived', false)
    .eq('courses.archived', false)
    .order('created_at');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((k: any) => ({
    id: k.id,
    name: k.name,
    courseId: k.course_id,
    courseName: k.courses.name,
    label: `${k.courses.name} / ${k.name}`,
  }));
}
