import Link from 'next/link';
import { Card, LinkButton, Notice, PageTitle, type Flash } from '@/components/ui';
import { hasPerm, requireStaff } from '@/lib/auth';
import { getClassOptions } from '@/lib/classes';
import { formatDate } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { STATUS_LABEL, type AccountStatus } from '@/lib/types';

type Search = Flash & { q?: string; course?: string; class?: string; status?: string };

const STATUS_COLOR: Record<AccountStatus, string> = {
  active: 'bg-brand-100 text-brand-700',
  invited: 'bg-sky-100 text-sky-800',
  suspended: 'bg-gray-200 text-gray-700',
};

export default async function TraineesPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireStaff();
  const sp = await searchParams;
  const supabase = await createClient();
  const [classes, canManage, { data }] = await Promise.all([
    getClassOptions(),
    hasPerm('manage_trainees'),
    supabase
      .from('profiles')
      .select('id, full_name, full_name_kana, status, trainee_details(expected_completion_on, phone), enrollments(class_id, ended_on, classes(name, course_id, courses(name)))')
      .eq('role', 'trainee')
      .order('full_name_kana'),
  ]);

  // 規模（数百人以内）を考え、絞り込みは取得後に行う（見える範囲は権限ルールで制限済み）
  const q = (sp.q ?? '').trim().toLowerCase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).map((t: any) => {
    const cur = (t.enrollments ?? []).find((e: { ended_on: string | null }) => !e.ended_on);
    return {
      id: t.id as string,
      name: t.full_name as string,
      kana: t.full_name_kana as string,
      status: t.status as AccountStatus,
      completion: t.trainee_details?.expected_completion_on as string | null,
      phone: (t.trainee_details?.phone ?? '') as string,
      classId: cur?.class_id as string | undefined,
      courseId: cur?.classes?.course_id as string | undefined,
      label: cur ? `${cur.classes.courses.name} / ${cur.classes.name}` : '未所属',
    };
  }).filter((r) =>
    (!q || r.name.toLowerCase().includes(q) || r.kana.toLowerCase().includes(q) || (q.replace(/\D/g, '').length >= 3 && r.phone.includes(q.replace(/\D/g, '')))) &&
    (!sp.course || r.courseId === sp.course) &&
    (!sp.class || r.classId === sp.class) &&
    (!sp.status || r.status === sp.status),
  );
  const courses = [...new Map(classes.map((c) => [c.courseId, c.courseName])).entries()];

  return (
    <div className="space-y-4">
      <PageTitle
        action={
          canManage && (
            <div className="flex flex-wrap gap-2">
              <LinkButton href="/admin/trainees/invites" variant="secondary">招待QRをまとめて発行</LinkButton>
              <LinkButton href="/admin/trainees/import" variant="secondary">Excel・CSVで一括登録</LinkButton>
              <LinkButton href="/admin/trainees/new">＋ 訓練生を登録</LinkButton>
            </div>
          )
        }
      >
        訓練生
      </PageTitle>
      <Notice error={sp.error} message={sp.message} />
      <Card>
        <form className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end">
          <input name="q" defaultValue={sp.q} placeholder="氏名・フリガナ・携帯番号で検索" aria-label="検索" />
          <select name="course" defaultValue={sp.course ?? ''} aria-label="コース">
            <option value="">すべてのコース</option>
            {courses.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select name="class" defaultValue={sp.class ?? ''} aria-label="クラス">
            <option value="">すべてのクラス</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select name="status" defaultValue={sp.status ?? ''} aria-label="利用状況">
            <option value="">すべての状態</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="min-h-11 rounded-xl bg-brand-600 px-5 font-bold text-white">絞り込み</button>
        </form>
      </Card>
      <p className="muted text-sm">{rows.length} 人</p>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-left">
          <thead className="muted text-sm">
            <tr className="border-b line">
              <th className="px-4 py-2">氏名</th>
              <th className="px-4 py-2">コース / クラス</th>
              <th className="px-4 py-2">修了予定日</th>
              <th className="px-4 py-2">状態</th>
            </tr>
          </thead>
          <tbody className="divide-y line">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-black/5">
                <td className="px-4 py-2">
                  <Link href={`/admin/trainees/${r.id}`} className="font-bold text-brand-700 underline-offset-2 hover:underline">{r.name}</Link>
                  <span className="muted block text-xs">{r.kana}</span>
                </td>
                <td className="px-4 py-2 text-sm">{r.label}</td>
                <td className="px-4 py-2 text-sm">{formatDate(r.completion)}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${STATUS_COLOR[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="muted px-4 py-6 text-center">該当する訓練生はいません</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
