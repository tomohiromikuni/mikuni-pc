import Link from 'next/link';
import { Button, Field, LinkButton, Notice, type Flash } from '@/components/ui';
import { hasPerm, requireStaff } from '@/lib/auth';
import { hasFinished } from '@/lib/completion';
import { formatDate } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { createClient } from '@/lib/supabase/server';
import { STATUS_LABEL, type AccountStatus } from '@/lib/types';
import { createCourse, setCourseArchived, setCourseSignup, updateCourse } from '../courses/actions';

type Search = Flash & { course?: string; class?: string; status?: string; q?: string; settings?: string; view?: string };

type Person = {
  id: string;
  name: string;
  kana: string;
  status: AccountStatus;
  phone: string;
  courseId: string;
  classId: string;
  className: string;
  push: boolean;
  absent: number;
  finished: boolean;
};

const STATUS_STYLE: Record<AccountStatus, string> = {
  active: 'bg-brand-100 text-brand-700',
  invited: 'bg-amber-50 text-amber-800',
  suspended: 'bg-gray-200 text-gray-700',
};

/** 管理画面「訓練生」一覧（デザイン案B：期生ごとのカード表示） */
export default async function TraineesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireStaff();
  const isAdmin = me.role === 'admin';
  const sp = await searchParams;
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());

  const [canManage, { data: courses }, { data: trainees }, overview] = await Promise.all([
    hasPerm('manage_trainees'),
    supabase.from('courses').select('id, name, starts_on, ends_on, archived, classes(id, name, archived, open_for_signup, created_at)').order('starts_on', { ascending: false, nullsFirst: false }),
    supabase
      .from('profiles')
      .select('id, full_name, full_name_kana, status, trainee_details(phone, expected_completion_on), enrollments(ended_on, class_id, classes(name, course_id))')
      .or('role.eq.trainee,also_trainee.eq.true')
      .order('full_name_kana'),
    // 通知・欠席の目印（データベースの追加設定前はなしで表示）
    supabase.rpc('trainee_overview').then((r) => (r.error ? [] : (r.data as { trainee_id: string; has_push: boolean; absent_month: number }[]))),
  ]);
  const ov = new Map(overview.map((o) => [o.trainee_id, o]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const courseById = new Map(((courses ?? []) as any[]).map((c) => [c.id, c]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const people: Person[] = ((trainees ?? []) as any[]).map((t) => {
    const cur = (t.enrollments ?? []).find((e: { ended_on: string | null }) => !e.ended_on);
    const o = ov.get(t.id);
    const c = courseById.get(cur?.classes?.course_id);
    return {
      id: t.id,
      name: t.full_name,
      kana: t.full_name_kana,
      status: t.status,
      phone: t.trainee_details?.phone ?? '',
      courseId: cur?.classes?.course_id ?? '',
      classId: cur?.class_id ?? '',
      className: cur?.classes?.name ?? '',
      push: !!o?.has_push,
      absent: o?.absent_month ?? 0,
      // 受講が終わった人（期を修了にした・期の終了日や本人の修了予定日を過ぎた）
      finished: hasFinished({ courseArchived: c?.archived, courseEndsOn: c?.ends_on, expectedCompletionOn: t.trainee_details?.expected_completion_on }, today),
    };
  });

  // 期生の一覧：受講中（新しい順）と修了した期に分ける
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allCourses = ((courses ?? []) as any[]).map((c) => ({
    ...c,
    count: people.filter((p) => p.courseId === c.id && p.status !== 'suspended').length,
    finished: c.archived || (c.ends_on && c.ends_on < today),
  }));
  const current = allCourses.filter((c) => !c.finished);
  const finished = allCourses.filter((c) => c.finished);
  const unassigned = people.filter((p) => !p.courseId && p.status !== 'suspended' && !p.finished).length;
  // 「受講中」と「修了生」の切り替え
  const view: 'current' | 'done' = sp.view === 'done' ? 'done' : 'current';
  const activeCount = people.filter((p) => !p.finished && p.status !== 'suspended').length;
  const doneCount = people.filter((p) => p.finished).length;

  const q = (sp.q ?? '').trim();
  const qDigits = q.replace(/\D/g, '');
  const searching = q.length > 0;
  // 選んでいる期：指定がなければ受講中の一番新しい期
  const selected = searching ? 'all' : sp.course ?? (view === 'current' ? current[0]?.id : undefined) ?? 'all';
  const course = allCourses.find((c) => c.id === selected);

  const inCourse = people
    .filter((p) => (selected === 'all' ? true : selected === 'none' ? !p.courseId : p.courseId === selected))
    // 検索中以外は、受講中の画面に修了した人を出さない（修了生の画面はその逆）
    .filter((p) => searching || (view === 'done' ? p.finished : !p.finished));
  const hiddenFinished = view === 'current' && !searching ? people.filter((p) => p.finished && (selected === 'all' || p.courseId === selected)).length : 0;
  const shown = inCourse
    .filter((p) => !searching || p.name.includes(q) || p.kana.includes(q) || (qDigits.length >= 3 && p.phone.includes(qDigits)))
    .filter((p) => !sp.class || p.classId === sp.class)
    .filter((p) => (sp.status ? p.status === sp.status : p.status !== 'suspended'));
  const waiting = inCourse.filter((p) => p.status === 'invited').length;
  const suspended = inCourse.filter((p) => p.status === 'suspended').length;
  type ClassRow = { id: string; name: string; archived: boolean; open_for_signup: boolean; created_at: string };
  const allClasses: ClassRow[] = [...(course?.classes ?? [])].sort((a: ClassRow, b: ClassRow) => a.created_at.localeCompare(b.created_at));
  const classes = allClasses.filter((k) => !k.archived);
  const settingsOpen = isAdmin && !!course && !searching && sp.settings === '1';
  const signupOpen = classes.some((k) => k.open_for_signup);

  const href = (p: Partial<Search>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ view: view === 'done' ? 'done' : undefined, course: selected === 'all' && !sp.course ? undefined : selected, ...p })) if (v) u.set(k, v);
    return `/admin/trainees${u.size ? '?' + u : ''}`;
  };
  const chip = (active: boolean) => `shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-bold ${active ? 'border-[#1f2a26] bg-[#1f2a26] text-white' : 'surface'}`;
  const side = (active: boolean) => `flex items-center justify-between rounded-xl px-3 py-2.5 font-bold ${active ? 'surface border-2 border-brand-600' : 'hover:bg-black/5'}`;

  return (
    <div className="flex flex-wrap gap-6">
      {/* 期生の一覧 */}
      <nav aria-label="期生" className="w-full shrink-0 space-y-1 md:w-56">
        <div role="tablist" aria-label="受講中と修了生" className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-black/5 p-1">
          <Link role="tab" aria-selected={view === 'current'} href="/admin/trainees" className={`rounded-lg px-2 py-2 text-center text-sm font-bold ${view === 'current' ? 'surface shadow-sm text-brand-700' : 'muted'}`}>
            受講中 <span className="font-normal">{activeCount}</span>
          </Link>
          <Link role="tab" aria-selected={view === 'done'} href="/admin/trainees?view=done" className={`rounded-lg px-2 py-2 text-center text-sm font-bold ${view === 'done' ? 'surface shadow-sm text-[#1f2a26]' : 'muted'}`}>
            修了生 <span className="font-normal">{doneCount}</span>
          </Link>
        </div>

        {view === 'current' ? (
          <>
            <p className="muted px-2 pb-1 text-[13px] font-bold">受講中の期</p>
            {current.map((c) => (
              <Link key={c.id} href={`/admin/trainees?course=${c.id}`} className={side(selected === c.id)}>
                <span className="truncate">{c.name}</span>
                <span className="muted ml-2 shrink-0 text-sm">{people.filter((p) => p.courseId === c.id && !p.finished && p.status !== 'suspended').length}</span>
              </Link>
            ))}
            {unassigned > 0 && (
              <Link href="/admin/trainees?course=none" className={`${side(selected === 'none')} text-amber-800`}>
                <span>未所属</span>
                <span className="text-sm">{unassigned}</span>
              </Link>
            )}
            <Link href="/admin/trainees?course=all" className={side(selected === 'all')}>
              <span>受講中の全員</span>
              <span className="muted text-sm">{activeCount}</span>
            </Link>
            {isAdmin && (
              <details className="pt-2">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center rounded-xl border-2 border-dashed border-[#b9c6c1] font-bold text-brand-700">
                  ＋ 新しい期を作る
                </summary>
                <form action={createCourse} className="surface mt-2 space-y-3 rounded-xl border p-3">
                  <Field label="期の名前"><input name="name" required placeholder="例：2027年2月期" /></Field>
                  <Field label="開始日"><input name="starts_on" type="date" /></Field>
                  <Field label="終了日"><input name="ends_on" type="date" /></Field>
                  <label className="flex items-center gap-2 text-sm font-normal"><input type="checkbox" name="open_for_signup" defaultChecked /> すぐに登録を受け付ける</label>
                  <Button type="submit" className="w-full">作成する</Button>
                </form>
              </details>
            )}
            {current.length === 0 && (
              <p className="muted px-2 text-sm">
                受講中の期がありません。{isAdmin ? '「＋ 新しい期を作る」から作成してください。' : '管理者に作成を依頼してください。'}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="muted px-2 pb-1 text-[13px] font-bold">修了した期</p>
            {finished.map((c) => (
              <Link key={c.id} href={`/admin/trainees?view=done&course=${c.id}`} className={side(selected === c.id)}>
                <span className="truncate">{c.name}</span>
                <span className="muted ml-2 shrink-0 text-sm">{people.filter((p) => p.courseId === c.id && p.finished).length}</span>
              </Link>
            ))}
            <Link href="/admin/trainees?view=done&course=all" className={side(selected === 'all')}>
              <span>修了生の全員</span>
              <span className="muted text-sm">{doneCount}</span>
            </Link>
            <p className="muted px-2 pt-2 text-xs">修了生にはスマホへの通知は送られません。</p>
          </>
        )}
      </nav>

      {/* 選んだ期の訓練生 */}
      <section className="min-w-0 flex-[999_1_560px] space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-bold">
              {searching ? `「${q}」の検索結果` : selected === 'all' ? (view === 'done' ? '修了生の全員' : '受講中の全員') : selected === 'none' ? '未所属' : course?.name}
              {!searching && view === 'done' && <span className="ml-2 rounded-md bg-black/10 px-2 py-0.5 align-middle text-sm">修了生</span>}
            </h1>
            {course && !searching && (
              <p className="muted text-[13px]">
                {formatDate(course.starts_on)} 〜 {formatDate(course.ends_on)} ・ {course.count}人
                {signupOpen && !course.archived && <span className="ml-2 rounded-md bg-brand-100 px-1.5 py-px text-xs font-bold text-brand-700">登録受付中</span>}
              </p>
            )}
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              {isAdmin && course && !searching && (
                <LinkButton
                  href={settingsOpen ? `/admin/trainees?course=${course.id}` : `/admin/trainees?course=${course.id}&settings=1`}
                  variant="secondary"
                  aria-expanded={settingsOpen}
                  className={settingsOpen ? 'border-2 border-brand-600 bg-brand-50 text-brand-700' : ''}
                >
                  期の設定 {settingsOpen ? '▲' : '▼'}
                </LinkButton>
              )}
              <LinkButton href="/admin/join-qr" variant="secondary">登録用QR</LinkButton>
              <LinkButton href="/admin/trainees/import" variant="secondary">Excel・CSVで一括登録</LinkButton>
              <LinkButton href="/admin/trainees/new">＋ 登録</LinkButton>
            </div>
          )}
        </div>
        <Notice error={sp.error} message={sp.message} />

        {settingsOpen && course && (
          <section aria-label="期の設定" className="surface space-y-4 rounded-2xl border-2 border-brand-600 p-4">
            <form action={updateCourse.bind(null, course.id)} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
              <Field label="期の名前"><input name="name" defaultValue={course.name} required /></Field>
              <Field label="開始日"><input name="starts_on" type="date" defaultValue={course.starts_on ?? ''} /></Field>
              <Field label="終了日"><input name="ends_on" type="date" defaultValue={course.ends_on ?? ''} /></Field>
              <Button type="submit" variant="secondary">保存</Button>
            </form>

            {!course.archived && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-black/[0.03] px-3 py-3">
                <span className="flex-1 text-sm">
                  <strong>共通QRからの登録</strong>
                  <span className="muted block text-xs">受付中にすると、登録画面でこの期を選べるようになります。受付が終わったらオフにしてください。</span>
                </span>
                <form action={setCourseSignup.bind(null, course.id, !signupOpen)}>
                  <button className={`min-h-10 rounded-full px-4 text-sm font-bold ${signupOpen ? 'bg-brand-600 text-white' : 'bg-black/10'}`}>
                    {signupOpen ? '✓ 登録受付中' : '登録受付オフ'}
                  </button>
                </form>
              </div>
            )}

            <form action={setCourseArchived.bind(null, course.id, !course.archived)} className="border-t line pt-3 text-right">
              <button className="text-sm text-red-700 underline">
                {course.archived ? '受講中に戻す' : 'この期を修了にする（登録受付も止まります。記録は残ります）'}
              </button>
            </form>
          </section>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {waiting > 0 && (
            <Link
              href={href({ class: sp.class, status: sp.status === 'invited' ? undefined : 'invited' })}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-bold ${sp.status === 'invited' ? 'border-amber-600 bg-amber-600 text-white' : 'border-amber-300 bg-amber-50 text-amber-900'}`}
            >
              登録待ち {waiting}人
            </Link>
          )}
          {suspended > 0 && (
            <Link href={href({ class: sp.class, status: sp.status === 'suspended' ? undefined : 'suspended' })} className={chip(sp.status === 'suspended')}>
              利用停止 {suspended}人
            </Link>
          )}
          <form action="/admin/trainees" className="ml-auto w-full sm:w-64">
            <input name="q" defaultValue={sp.q} placeholder="名前・フリガナ・携帯番号で検索" aria-label="訓練生を検索" />
          </form>
        </div>

        {shown.length === 0 ? (
          <p className="muted py-10 text-center">該当する訓練生はいません</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {shown.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/trainees/${p.id}`} className="surface flex h-full gap-3 rounded-2xl border p-3.5 hover:border-brand-500">
                  <span
                    aria-hidden
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-bold ${p.status === 'active' && !p.finished ? 'bg-brand-600 text-white' : 'bg-black/10 text-[#5d6b66]'}`}
                  >
                    {p.name.trim()[0] ?? '?'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{p.name}</span>
                    <span className="muted block truncate text-xs">
                      {[selected === 'all' ? allCourses.find((c) => c.id === p.courseId)?.name ?? '未所属' : '', formatPhone(p.phone)].filter(Boolean).join(' ・ ')}
                    </span>
                    <span className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-bold">
                      {p.finished ? (
                        <span className="rounded-md bg-gray-200 px-1.5 py-px text-gray-700">修了</span>
                      ) : (
                        <span className={`rounded-md px-1.5 py-px ${STATUS_STYLE[p.status]}`}>{p.status === 'invited' ? '登録待ち' : STATUS_LABEL[p.status]}</span>
                      )}
                      {p.status === 'active' && !p.finished && p.push && <span className="rounded-md bg-black/5 px-1.5 py-px">通知オン</span>}
                      {p.absent >= 3 && <span className="rounded-md bg-red-50 px-1.5 py-px text-red-800">今月 欠席{p.absent}</span>}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {hiddenFinished > 0 && (
          <p className="text-sm">
            受講が終わった人（{hiddenFinished}人）は <Link href={`/admin/trainees?view=done${selected !== 'all' ? `&course=${selected}` : ''}`} className="font-bold text-brand-700 underline">修了生</Link> に表示しています。
          </p>
        )}
        <p className="muted text-xs">表示されるのは、あなたの担当範囲の訓練生だけです。「今月 欠席」は出欠確認の回答から数えています（3回以上で表示）。</p>
      </section>
    </div>
  );
}
