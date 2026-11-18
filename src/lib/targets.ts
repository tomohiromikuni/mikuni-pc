import 'server-only';
import { getClassOptions } from '@/lib/classes';
import { createClient } from '@/lib/supabase/server';

/** 自分が配信してよい宛先の選択肢（担当範囲はデータベースの関数で判定） */
export async function getTargetOptions() {
  const supabase = await createClient();
  const classes = await getClassOptions();
  const courses = [...new Map(classes.map((c) => [c.courseId, c.courseName])).entries()].map(([id, name]) => ({ id, name }));
  const [{ data: all }, courseOk, classOk] = await Promise.all([
    supabase.rpc('has_full_scope'),
    Promise.all(courses.map((c) => supabase.rpc('can_access_course', { p_course_id: c.id }).then((r) => r.data === true))),
    Promise.all(classes.map((c) => supabase.rpc('can_access_class', { p_class_id: c.id }).then((r) => r.data === true))),
  ]);
  return {
    all: all === true,
    courses: courses.filter((_, i) => courseOk[i]),
    classes: classes.filter((_, i) => classOk[i]),
  };
}
