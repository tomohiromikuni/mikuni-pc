import 'server-only';
import { cache } from 'react';
import { getMe } from '@/lib/auth';
import { hasFinished } from '@/lib/completion';
import { createClient } from '@/lib/supabase/server';

export type MyStatus = {
  graduate: boolean; // 受講が終わった訓練生
  courseName: string | null;
  startsOn: string | null;
  endsOn: string | null; // 修了日（修了予定日、なければ期の終了日）
  usableUntil: string | null; // 修了後90日（自動停止の日）
};

const addDays = (ymd: string, n: number) => new Date(new Date(ymd + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);

/** ログイン中の訓練生の受講状況（修了生かどうか、受講記録） */
export const getMyStatus = cache(async (): Promise<MyStatus> => {
  const me = await getMe();
  const empty: MyStatus = { graduate: false, courseName: null, startsOn: null, endsOn: null, usableUntil: null };
  if (!me || me.role !== 'trainee') return empty; // 運営メンバー（訓練生モード）は常に受講中の画面
  const supabase = await createClient();
  const [{ data: detail }, { data: enr }] = await Promise.all([
    supabase.from('trainee_details').select('enrolled_on, expected_completion_on').eq('profile_id', me.id).maybeSingle(),
    supabase.from('enrollments').select('started_on, classes(courses(name, starts_on, ends_on, archived))').eq('trainee_id', me.id).is('ended_on', null).maybeSingle(),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (enr as any)?.classes?.courses;
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
  const graduate = hasFinished({ courseArchived: c?.archived, courseEndsOn: c?.ends_on, expectedCompletionOn: detail?.expected_completion_on }, today);
  const endsOn = detail?.expected_completion_on ?? c?.ends_on ?? null;
  return {
    graduate,
    courseName: c?.name ?? null,
    startsOn: detail?.enrolled_on ?? c?.starts_on ?? enr?.started_on ?? null,
    endsOn,
    usableUntil: detail?.expected_completion_on ? addDays(detail.expected_completion_on, 90) : null,
  };
});
