import 'server-only';
import { getClassOptions } from '@/lib/classes';
import { createClient } from '@/lib/supabase/server';

/** 自分が配信してよい宛先の選択肢（担当範囲はデータベースの関数で判定） */
export async function getTargetOptions() {
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
  const [classes, { data: allCourses }] = await Promise.all([
    getClassOptions(),
    supabase.from('courses').select('id, name, ends_on, archived, starts_on').order('starts_on', { ascending: false, nullsFirst: false }),
  ]);
  const isFinished = (c: { archived: boolean; ends_on: string | null }) => c.archived || (!!c.ends_on && c.ends_on < today);
  const current = [...new Map(classes.map((c) => [c.courseId, c.courseName])).entries()]
    .map(([id, name]) => ({ id, name }))
    .filter((c) => !(allCourses ?? []).some((x) => x.id === c.id && isFinished(x)));
  const finished = (allCourses ?? []).filter(isFinished).map((c) => ({ id: c.id, name: c.name }));
  const [{ data: all }, curOk, finOk] = await Promise.all([
    supabase.rpc('has_full_scope'),
    Promise.all(current.map((c) => supabase.rpc('can_access_course', { p_course_id: c.id }).then((r) => r.data === true))),
    Promise.all(finished.map((c) => supabase.rpc('can_access_course', { p_course_id: c.id }).then((r) => r.data === true))),
  ]);
  return {
    all: all === true,
    courses: current.filter((_, i) => curOk[i]),
    finishedCourses: finished.filter((_, i) => finOk[i]),
    classes,
  };
}
