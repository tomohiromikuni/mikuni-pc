import Link from 'next/link';
import { AutoRefresh } from '@/components/AutoRefresh';
import { PushSetup } from '@/components/PushSetup';
import { Notice } from '@/components/ui';
import { env } from '@/lib/env';
import { requirePerm } from '@/lib/auth';
import type { ChatStatus } from '@/lib/chat';
import { hasFinished } from '@/lib/completion';
import { friendlyDateTime } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

type Row = {
  traineeId: string;
  name: string;
  kana: string;
  courseId: string;
  courseName: string;
  className: string;
  roomId: string | null;
  status: ChatStatus | null;
  lastAt: string | null;
  lastBody: string | null;
  needsReply: boolean;
  unread: boolean;
  finished: boolean;
};


/** 学校側のチャット一覧（LINEのトーク一覧のように、名簿の全員を表示） */
export default async function ChatList({ searchParams }: { searchParams: Promise<{ course?: string; q?: string; filter?: string; error?: string; message?: string; view?: string }> }) {
  const me = await requirePerm('chat');
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: trainees }, { data: rooms }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, full_name_kana, trainee_details(expected_completion_on), enrollments(ended_on, classes(name, course_id, courses(name, starts_on, ends_on, archived)))')
      .or('role.eq.trainee,also_trainee.eq.true')
      .neq('status', 'suspended')
      .order('full_name_kana'),
    supabase
      .from('chat_rooms')
      .select('id, trainee_id, status, last_message_at, last_sender_role, chat_reads(user_id, last_read_at), chat_messages(body, created_at)')
      .order('created_at', { referencedTable: 'chat_messages', ascending: false })
      .limit(1, { referencedTable: 'chat_messages' }),
  ]);

  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
  // 受講中と修了生を分ける
  const view: 'current' | 'done' = sp.view === 'done' ? 'done' : 'current';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roomBy = new Map((rooms ?? []).map((r: any) => [r.trainee_id, r]));
  const courseStart = new Map<string, string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: Row[] = ((trainees ?? []) as any[]).map((t) => {
    const cur = (t.enrollments ?? []).find((e: { ended_on: string | null }) => !e.ended_on);
    const r = roomBy.get(t.id);
    const myRead = r?.chat_reads?.find((x: { user_id: string }) => x.user_id === me.id)?.last_read_at;
    const needsReply = r?.last_sender_role === 'trainee';
    if (cur) courseStart.set(cur.classes.course_id, cur.classes.courses.starts_on ?? '');
    return {
      traineeId: t.id,
      name: t.full_name,
      kana: t.full_name_kana,
      courseId: cur?.classes.course_id ?? '',
      courseName: cur?.classes.courses.name ?? '未所属',
      className: cur?.classes.name ?? '',
      roomId: r?.id ?? null,
      status: r?.last_message_at ? (r.status as ChatStatus) : null,
      lastAt: r?.last_message_at ?? null,
      lastBody: r?.last_message_at ? r.chat_messages?.[0]?.body || '（写真・ファイル）' : null,
      needsReply,
      unread: needsReply && (!myRead || myRead < r.last_message_at),
      finished: hasFinished(
        { courseArchived: cur?.classes.courses.archived, courseEndsOn: cur?.classes.courses.ends_on, expectedCompletionOn: t.trainee_details?.expected_completion_on },
        today,
      ),
    };
  });

  const inView = all.filter((r) => (view === 'done' ? r.finished : !r.finished));
  const doneCount = all.filter((r) => r.finished).length;
  const doneUnread = all.filter((r) => r.finished && r.unread).length;
  const currentUnread = all.filter((r) => !r.finished && r.unread).length;
  // 期生（コース）の一覧：新しい期が先
  const courses = [...new Map(inView.map((r) => [r.courseId, r.courseName])).entries()].sort(
    (a, b) => (courseStart.get(b[0]) ?? '').localeCompare(courseStart.get(a[0]) ?? '') || a[1].localeCompare(b[1], 'ja'),
  );
  const q = (sp.q ?? '').trim();
  const rows = inView
    .filter((r) => !sp.course || r.courseId === sp.course)
    .filter((r) => !q || r.name.includes(q) || r.kana.includes(q))
    .filter((r) => sp.filter !== 'unread' || r.unread)
    // 並び順：未読 → 最近やり取りした順 → まだやり取りがない人（フリガナ順）
    .sort((a, b) => Number(b.unread) - Number(a.unread) || (b.lastAt ?? '').localeCompare(a.lastAt ?? '') || a.kana.localeCompare(b.kana, 'ja'));
  const unreadCount = inView.filter((r) => (!sp.course || r.courseId === sp.course) && r.unread).length;

  const groups = sp.course ? [[sp.course, rows]] as const : courses.map(([id]) => [id, rows.filter((r) => r.courseId === id)] as const).filter(([, list]) => list.length > 0);
  const href = (p: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ view: view === 'done' ? 'done' : undefined, course: sp.course, q: sp.q, filter: sp.filter, ...p })) if (v) u.set(k, v);
    return `/admin/chat${u.size ? '?' + u : ''}`;
  };
  const chip = (active: boolean) => `shrink-0 rounded-full border px-4 py-1.5 text-sm font-bold ${active ? 'border-brand-600 bg-brand-600 text-white' : 'surface'}`;

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={10} />
      <h1 className="text-xl font-bold">チャット</h1>
      <Notice error={sp.error} message={sp.message} />
      {/* この端末で通知を受け取っていなければ案内（受け取り中なら表示しない） */}
      <PushSetup vapidKey={env.vapidPublicKey()} compact audience="staff" />

      <div role="tablist" aria-label="受講中と修了生" className="grid max-w-sm grid-cols-2 gap-1 rounded-xl bg-black/5 p-1">
        <Link role="tab" aria-selected={view === 'current'} href="/admin/chat" className={`rounded-lg px-2 py-2 text-center text-sm font-bold ${view === 'current' ? 'surface shadow-sm text-brand-700' : 'muted'}`}>
          受講中{currentUnread > 0 && <span className="ml-1 text-red-700">未読 {currentUnread}</span>}
        </Link>
        <Link role="tab" aria-selected={view === 'done'} href="/admin/chat?view=done" className={`rounded-lg px-2 py-2 text-center text-sm font-bold ${view === 'done' ? 'surface shadow-sm' : 'muted'}`}>
          修了生 <span className="font-normal">{doneCount}</span>{doneUnread > 0 && <span className="ml-1 text-red-700">未読 {doneUnread}</span>}
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="期生で絞り込み">
        <Link href={href({ course: undefined })} className={chip(!sp.course)}>すべての期</Link>
        {courses.map(([id, name]) => (
          <Link key={id || 'none'} href={href({ course: id || undefined })} className={chip(sp.course === id)}>{name}</Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form className="flex flex-1 gap-2" action="/admin/chat">
          {view === 'done' && <input type="hidden" name="view" value="done" />}
          {sp.course && <input type="hidden" name="course" value={sp.course} />}
          {sp.filter && <input type="hidden" name="filter" value={sp.filter} />}
          <input name="q" defaultValue={sp.q} placeholder="名前・フリガナで検索" aria-label="名前で検索" className="max-w-xs" />
        </form>
        <Link href={href({ filter: sp.filter === 'unread' ? undefined : 'unread' })} className={chip(sp.filter === 'unread')}>
          未読だけ表示{unreadCount > 0 && `（${unreadCount}）`}
        </Link>
      </div>

      {groups.length === 0 && <p className="muted py-8 text-center">該当する訓練生はいません</p>}

      {groups.map(([courseId, list]) => (
        <section key={courseId || 'none'} className="space-y-1">
          {!sp.course && <h2 className="muted px-1 text-sm font-bold">{list[0]?.courseName}（{list.length}人）</h2>}
          <ul className="surface divide-y line overflow-hidden rounded-2xl border">
            {list.map((r) => (
              <li key={r.traineeId}>
                <Link
                  href={r.roomId ? `/admin/chat/${r.roomId}` : `/admin/chat/to/${r.traineeId}`}
                  prefetch={false}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-black/5"
                >
                  <span aria-hidden className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold ${r.lastAt ? 'bg-brand-600 text-white' : 'bg-black/10'}`}>
                    {r.name.trim()[0] ?? '?'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className={`truncate ${r.unread ? 'font-bold' : 'font-semibold'}`}>{r.name}</span>
                      <span className="muted shrink-0 text-xs">{r.className}</span>
                    </span>
                    <span className={`block truncate text-sm ${r.lastBody ? (r.unread ? 'font-semibold' : 'muted') : 'muted italic'}`}>
                      {r.lastBody ?? 'まだメッセージはありません'}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {r.lastAt && <span className="muted text-xs">{friendlyDateTime(r.lastAt)}</span>}
                    <span className="flex items-center gap-1.5">
                      {r.unread && <span className="text-xs font-bold text-red-700">未読</span>}
                      {r.unread && <span aria-label="未読" className="h-2.5 w-2.5 rounded-full bg-red-500" />}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="muted text-xs">表示されるのは、あなたの担当範囲の訓練生だけです（利用停止中の人は表示しません）。</p>
    </div>
  );
}
