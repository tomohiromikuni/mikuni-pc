import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export type StudentHit = { traineeId: string; orgId: string; classId: string; courseArchived: boolean; openForSignup: boolean };

/**
 * 受講番号（期の番号＋出席番号）から訓練生を探す（ログイン前に使うので管理用の接続で調べる）。
 * 見つからない・複数見つかる場合は null
 */
export async function findByStudentNo(cohort: number, seat: number): Promise<StudentHit | null> {
  const db = createAdminClient();
  const { data: courses } = await db.from('courses').select('id, archived').eq('cohort_no', cohort);
  if (!courses?.length) return null;
  const { data } = await db
    .from('enrollments')
    .select('trainee_id, org_id, class_id, classes!inner(course_id, archived, open_for_signup)')
    .eq('seat_no', seat)
    .is('ended_on', null)
    .in(
      'classes.course_id',
      courses.map((c) => c.id),
    );
  if (!data || data.length !== 1) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = data[0] as any;
  const course = courses.find((c) => c.id === e.classes.course_id);
  return {
    traineeId: e.trainee_id,
    orgId: e.org_id,
    classId: e.class_id,
    courseArchived: !!course?.archived,
    openForSignup: !!e.classes.open_for_signup && !e.classes.archived,
  };
}

/** その人のログイン用の内部ID（メールアドレス形式） */
export async function loginEmailOf(userId: string): Promise<string | null> {
  const { data } = await createAdminClient().auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}
