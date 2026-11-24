import Link from 'next/link';
import { Dialog } from '@/components/Dialog';
import { Button, Field, Notice, type Flash } from '@/components/ui';
import { hasPerm, requireStaff } from '@/lib/auth';
import { hasFinished } from '@/lib/completion';
import { formatDate } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { createClient } from '@/lib/supabase/server';
import { STATUS_LABEL, type AccountStatus } from '@/lib/types';
import { createCourse, setCourseArchived, setCourseSignup, updateCourse } from '../courses/actions';

type Search = Flash & { q?: string; view?: string };

type Person = { id: string; name: string; kana: string; status: AccountStatus; phone: string; courseId: string; seat: number | null; absent: number; finished: boolean };

type Course = { id: string; name: string; cohort_no: number | null; starts_on: string | null; ends_on: string | null; archived: boolean; finished: boolean; signup: boolean };

/** 出席番号の順（番号のない人は後ろにフリガナ順） */
const bySeat = (list: Person[]) => [...list].sort((a, b) => (a.seat ?? 1e9) - (b.seat ?? 1e9) || a.kana.localeCompare(b.kana, 'ja'));

/** 1つの期で最初に見せる人数（残りは「ほか○人を表示」） */
const FIRST = 10;

/** 管理画面「訓練生」（デザイン案A：受講中／修了生のタブ＋期の見出しつき一覧） */
export default async function TraineesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireStaff();
  const isAdmin = me.role === 'admin';
  const sp = await searchParams;
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());

  const [canManage, { data: courseRows }, { data: trainees }, overview] = await Promise.all([
    hasPerm('manage_trainees'),
    supabase.from('courses').select('id, name, cohort_no, starts_on, ends_on, archived, classes(archived, open_for_signup)').order('starts_on', { ascending: false, nullsFirst: false }),
    supabase
      .from('profiles')
      .select('id, full_name, full_name_kana, status, trainee_details(phone, expected_completion_on), enrollments(ended_on, seat_no, classes(course_id))')
      .or('role.eq.trainee,also_trainee.eq.true')
      .order('full_name_kana'),
    // 欠席の目印（データベースの追加設定前はなしで表示）
    supabase.rpc('trainee_overview').then((r) => (r.error ? [] : (r.data as { trainee_id: string; absent_month: number }[]))),
  ]);
  const ov = new Map(overview.map((o) => [o.trainee_id, o]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const courses: Course[] = ((courseRows ?? []) as any[]).map((c) => ({
    id: c.id,
    name: c.name,
    cohort_no: c.cohort_no,
    starts_on: c.starts_on,
    ends_on: c.ends_on,
    archived: c.archived,
    finished: c.archived || (!!c.ends_on && c.ends_on < today),
    signup: (c.classes ?? []).some((k: { archived: boolean; open_for_signup: boolean }) => !k.archived && k.open_for_signup),
  }));
  const courseById = new Map(courses.map((c) => [c.id, c]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const people: Person[] = ((trainees ?? []) as any[]).map((t) => {
    const cur = (t.enrollments ?? []).find((e: { ended_on: string | null }) => !e.ended_on);
    const c = courseById.get(cur?.classes?.course_id);
    return {
      id: t.id,
      name: t.full_name,
      kana: t.full_name_kana,
      status: t.status,
      phone: t.trainee_details?.phone ?? '',
      courseId: cur?.classes?.course_id ?? '',
      seat: cur?.seat_no ?? null,
      absent: ov.get(t.id)?.absent_month ?? 0,
      // 受講が終わった人（期を修了にした・期の終了日や本人の修了予定日を過ぎた）
      finished: hasFinished({ courseArchived: c?.archived, courseEndsOn: c?.ends_on, expectedCompletionOn: t.trainee_details?.expected_completion_on }, today),
    };
  });

  const view: 'current' | 'done' = sp.view === 'done' ? 'done' : 'current';
  const q = (sp.q ?? '').trim();
  const qDigits = q.replace(/\D/g, '');
  const inView = people.filter((p) => (view === 'done' ? p.finished : !p.finished));
  const activeCount = people.filter((p) => !p.finished && p.status !== 'suspended').length;
  const doneCount = people.filter((p) => p.finished).length;

  // 期ごとのまとまり（受講中の期は新しい順。人がいない受講中の期も見出しは出す）
  const groups = [
    ...courses
      .filter((c) => (view === 'done' ? inView.some((p) => p.courseId === c.id) : !c.finished || inView.some((p) => p.courseId === c.id)))
      .map((c) => ({ course: c as Course | null, members: bySeat(inView.filter((p) => p.courseId === c.id)) })),
    { course: null, members: inView.filter((p) => !p.courseId || !courseById.has(p.courseId)) },
  ].filter((g) => g.course || g.members.length > 0);

  const searched = q
    ? inView.filter((p) => p.name.includes(q) || p.kana.includes(q) || (qDigits.length >= 3 && p.phone.includes(qDigits)))
    : null;

  const tab = (active: boolean) => `rounded-[9px] px-2 py-2 text-center text-sm font-bold ${active ? 'surface shadow-sm text-brand-700' : 'muted'}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex-1 text-xl font-bold">訓練生</h1>
        {isAdmin && (
          <Dialog label="期の設定" title="期の設定" buttonClassName="surface min-h-11 rounded-xl border px-4 font-bold hover:brightness-95">
            <CourseSettings courses={courses} />
          </Dialog>
        )}
        {canManage && (
          <>
            <Link href="/admin/join-qr" className="surface inline-flex min-h-11 items-center rounded-xl border px-4 font-bold hover:brightness-95">登録用QR</Link>
            <details className="relative">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-xl bg-brand-600 px-4 font-bold text-white hover:brightness-95 [&::-webkit-details-marker]:hidden">＋ 登録</summary>
              <div className="surface line absolute right-0 z-20 mt-1 w-60 rounded-xl border p-1.5 shadow-[0_8px_24px_rgba(31,42,38,0.14)]">
                <Link href="/admin/trainees/new" className="flex min-h-11 items-center rounded-lg px-3 font-bold hover:bg-black/5">1人ずつ登録</Link>
                <Link href="/admin/trainees/import" className="flex min-h-11 items-center rounded-lg px-3 font-bold hover:bg-black/5">Excel・CSVでまとめて登録</Link>
              </div>
            </details>
          </>
        )}
      </div>
      <Notice error={sp.error} message={sp.message} />

      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="受講中と修了生" className="grid w-full grid-cols-2 gap-1 rounded-xl bg-black/[0.06] p-1 sm:w-72">
          <Link role="tab" aria-selected={view === 'current'} href="/admin/trainees" className={tab(view === 'current')}>
            受講中 <span className="font-normal">{activeCount}</span>
          </Link>
          <Link role="tab" aria-selected={view === 'done'} href="/admin/trainees?view=done" className={tab(view === 'done')}>
            修了生 <span className="font-normal">{doneCount}</span>
          </Link>
        </div>
        <form action="/admin/trainees" className="min-w-0 flex-1">
          {view === 'done' && <input type="hidden" name="view" value="done" />}
          <input name="q" defaultValue={q} placeholder="名前・フリガナ・携帯番号で検索" aria-label="訓練生を検索" className="w-full" />
        </form>
      </div>

      {searched ? (
        <section className="space-y-2">
          <p className="muted text-sm">
            「{q}」の検索結果：{searched.length}人 <Link href={view === 'done' ? '/admin/trainees?view=done' : '/admin/trainees'} className="ml-2 font-bold text-brand-700 underline">検索をやめる</Link>
          </p>
          <PeopleList people={searched} courseName={(id) => courseById.get(id)?.name} />
        </section>
      ) : groups.length === 0 ? (
        <p className="muted py-10 text-center">{view === 'done' ? '修了生はまだいません' : isAdmin ? '受講中の期がありません。「期の設定」から新しい期を作ってください。' : '受講中の訓練生はいません'}</p>
      ) : view === 'current' ? (
        groups.map((g) => (
          <section key={g.course?.id ?? 'none'} className="surface overflow-hidden rounded-2xl border">
            <GroupHeader course={g.course} count={g.members.filter((p) => p.status !== 'suspended').length} />
            <PeopleList people={g.members} flat />
          </section>
        ))
      ) : (
        // 修了生：期ごとにたたんで並べる
        groups.map((g) => (
          <details key={g.course?.id ?? 'none'} className="surface group overflow-hidden rounded-2xl border">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
              <span className="font-bold">{g.course?.name ?? '期なし'}</span>
              <span className="muted text-[13px]">
                {g.members.length}人{g.course?.ends_on && `・${formatDate(g.course.ends_on)} 修了`}
              </span>
              <svg className="muted ml-auto transition-transform group-open:rotate-180" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
            </summary>
            <PeopleList people={g.members} flat />
          </details>
        ))
      )}
      {view === 'done' && <p className="muted text-xs">修了生には、就職状況の確認などの依頼だけを通知します。</p>}
    </div>
  );
}

function GroupHeader({ course, count }: { course: Course | null; count: number }) {
  return (
    <div className="line flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b bg-black/[0.02] px-4 py-2.5">
      <h2 className={`text-base font-bold ${course ? '' : 'text-amber-800'}`}>{course?.name ?? '期が決まっていない人'}</h2>
      {course && !course.cohort_no && <span className="text-xs font-bold text-amber-800">期の番号が未設定（受講番号でログインできません）</span>}
      {course && (
        <span className="muted text-[13px]">
          {course.starts_on || course.ends_on ? `${formatDate(course.starts_on)}〜${formatDate(course.ends_on)}・` : ''}
          {count}人
        </span>
      )}
      {course?.signup && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-700">登録受付中</span>}
    </div>
  );
}

function PeopleList({ people, flat = false, courseName }: { people: Person[]; flat?: boolean; courseName?: (id: string) => string | undefined }) {
  if (people.length === 0) return <p className="muted px-4 py-4 text-sm">まだ登録されている人はいません。</p>;
  const row = (p: Person) => (
    <li key={p.id}>
      <Link href={`/admin/trainees/${p.id}`} className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-0.5 px-4 py-2.5 hover:bg-black/[0.03]">
        <span className={`w-10 shrink-0 text-right text-sm tabular-nums ${p.seat ? 'muted' : 'text-amber-800'}`} title={p.seat ? '出席番号' : '出席番号がありません'}>{p.seat ? `${p.seat}番` : '—'}</span>
        <span className={`min-w-0 flex-1 truncate font-bold ${p.status === 'suspended' ? 'muted' : ''}`}>{p.name}</span>
        {courseName && <span className="muted text-[13px]">{courseName(p.courseId) ?? '期なし'}</span>}
        <span className="muted w-32 text-sm">{formatPhone(p.phone)}</span>
        <span className="flex w-36 justify-end gap-1.5 text-[12px] font-bold">
          {p.absent >= 3 && <span className="rounded-md bg-red-50 px-1.5 py-px text-red-800">今月 欠席{p.absent}</span>}
          {p.status === 'invited' ? (
            <span className="text-amber-800">まだ登録していない</span>
          ) : p.status === 'suspended' ? (
            <span className="muted">{STATUS_LABEL.suspended}</span>
          ) : (
            <span className="text-brand-700">利用中</span>
          )}
        </span>
      </Link>
    </li>
  );
  const first = people.slice(0, FIRST);
  const rest = people.slice(FIRST);
  return (
    <ul className={`line divide-y ${flat ? '' : 'surface overflow-hidden rounded-2xl border'}`}>
      {first.map(row)}
      {rest.length > 0 && (
        <li>
          <details>
            <summary className="line cursor-pointer list-none border-t px-4 py-2.5 text-sm font-bold text-brand-700 [&::-webkit-details-marker]:hidden">ほか{rest.length}人を表示</summary>
            <ul className="line divide-y border-t">{rest.map(row)}</ul>
          </details>
        </li>
      )}
    </ul>
  );
}

/** 「期の設定」ポップアップの中身：受講中の期の編集・登録受付・修了、新しい期を作る */
function CourseSettings({ courses }: { courses: Course[] }) {
  const current = courses.filter((c) => !c.finished);
  const finished = courses.filter((c) => c.finished).slice(0, 5);
  return (
    <div className="space-y-5">
      {current.length === 0 && <p className="muted text-sm">受講中の期はありません。</p>}
      {current.map((c) => (
        <section key={c.id} className="line space-y-3 rounded-xl border p-3">
          <form action={updateCourse.bind(null, c.id)} className="grid gap-3 sm:grid-cols-[5rem_2fr_1fr_1fr_auto] sm:items-end">
            <Field label="期の番号"><input name="cohort_no" inputMode="numeric" defaultValue={c.cohort_no ?? ''} placeholder="27" maxLength={4} /></Field>
            <Field label="期の名前"><input name="name" defaultValue={c.name} required /></Field>
            <Field label="開始日"><input name="starts_on" type="date" defaultValue={c.starts_on ?? ''} /></Field>
            <Field label="終了日"><input name="ends_on" type="date" defaultValue={c.ends_on ?? ''} /></Field>
            <Button type="submit" variant="secondary">保存</Button>
          </form>
          <div className="flex flex-wrap items-center gap-3">
            <form action={setCourseSignup.bind(null, c.id, !c.signup)}>
              <button className={`min-h-10 rounded-full px-4 text-sm font-bold ${c.signup ? 'bg-brand-600 text-white' : 'bg-black/10'}`}>
                {c.signup ? '✓ 登録受付中' : '登録受付オフ'}
              </button>
            </form>
            <span className="muted flex-1 text-xs">受付中の期は、共通QRの登録画面で選べます。</span>
            <form action={setCourseArchived.bind(null, c.id, true)}>
              <button className="text-sm text-red-700 underline">この期を修了にする</button>
            </form>
          </div>
        </section>
      ))}

      <details className="line rounded-xl border">
        <summary className="cursor-pointer list-none px-3 py-3 font-bold text-brand-700 [&::-webkit-details-marker]:hidden">＋ 新しい期を作る</summary>
        <form action={createCourse} className="grid gap-3 px-3 pb-3 sm:grid-cols-[5rem_2fr_1fr_1fr] sm:items-end">
          <Field label="期の番号"><input name="cohort_no" inputMode="numeric" required placeholder="28" maxLength={4} /></Field>
          <Field label="期の名前（空なら「28期生」）"><input name="name" placeholder="例：28期生" /></Field>
          <Field label="開始日"><input name="starts_on" type="date" /></Field>
          <Field label="終了日"><input name="ends_on" type="date" /></Field>
          <label className="flex items-center gap-2 text-sm font-normal sm:col-span-4"><input type="checkbox" name="open_for_signup" defaultChecked /> すぐに登録を受け付ける</label>
          <Button type="submit" className="sm:col-span-4 sm:justify-self-start">作成する</Button>
        </form>
      </details>

      {finished.length > 0 && (
        <div className="space-y-1">
          <p className="muted text-xs font-bold">最近修了した期</p>
          {finished.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1">{c.name}</span>
              {c.archived && (
                <form action={setCourseArchived.bind(null, c.id, false)}>
                  <button className="text-brand-700 underline">受講中に戻す</button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
