import Link from 'next/link';
import { hasFinished } from '@/lib/completion';
import { friendlyDateTime } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

type Row = {
  traineeId: string;
  name: string;
  kana: string;
  courseName: string;
  roomId: string | null;
  lastAt: string | null;
  lastBody: string | null;
  lastFromStaff: boolean;
  unread: number;
  finished: boolean;
};

/**
 * チャット一覧（デザイン案B：PCでは左に一覧・右にトーク）。
 * 「受講中／修了生」と検索だけ。LINEのように最後のメッセージと未読の数を表示する。
 */
export async function ChatListPane({ meId, view, q, activeRoomId }: { meId: string; view: 'current' | 'done'; q: string; activeRoomId?: string }) {
  const supabase = await createClient();
  const [{ data: trainees }, { data: rooms }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, full_name_kana, trainee_details(expected_completion_on), enrollments(ended_on, classes(courses(name, ends_on, archived)))')
      .or('role.eq.trainee,also_trainee.eq.true')
      .neq('status', 'suspended')
      .order('full_name_kana'),
    supabase
      .from('chat_rooms')
      .select('id, trainee_id, last_message_at, last_sender_role, chat_reads(user_id, last_read_at), chat_messages(body, created_at, sender_id)')
      .order('created_at', { referencedTable: 'chat_messages', ascending: false })
      .limit(1, { referencedTable: 'chat_messages' }),
  ]);

  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roomBy = new Map((rooms ?? []).map((r: any) => [r.trainee_id, r]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: Row[] = ((trainees ?? []) as any[]).map((t) => {
    const cur = (t.enrollments ?? []).find((e: { ended_on: string | null }) => !e.ended_on);
    const c = cur?.classes?.courses;
    const r = roomBy.get(t.id);
    const myRead: string | undefined = r?.chat_reads?.find((x: { user_id: string }) => x.user_id === meId)?.last_read_at;
    const last = r?.chat_messages?.[0];
    const waiting = r?.last_sender_role === 'trainee' && (!myRead || myRead < r.last_message_at);
    return {
      traineeId: t.id,
      name: t.full_name,
      kana: t.full_name_kana,
      courseName: c?.name ?? '',
      roomId: r?.id ?? null,
      lastAt: r?.last_message_at ?? null,
      lastBody: r?.last_message_at ? last?.body || '[写真・ファイル]' : null,
      lastFromStaff: r?.last_sender_role === 'staff',
      unread: waiting ? 1 : 0,
      finished: hasFinished({ courseArchived: c?.archived, courseEndsOn: c?.ends_on, expectedCompletionOn: t.trainee_details?.expected_completion_on }, today),
    };
  });

  // 未読の「数」：未読のある部屋だけ、訓練生からのメッセージを数える
  const unreadRooms = all.filter((r) => r.unread && r.roomId);
  if (unreadRooms.length) {
    const reads = new Map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (rooms ?? []).map((r: any) => [r.id, r.chat_reads?.find((x: { user_id: string }) => x.user_id === meId)?.last_read_at ?? '']),
    );
    const traineeOf = new Map(unreadRooms.map((r) => [r.roomId!, r.traineeId]));
    const oldest = unreadRooms.map((r) => reads.get(r.roomId!) || '1970-01-01').sort()[0];
    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('room_id, sender_id, created_at')
      .in('room_id', [...traineeOf.keys()])
      .gt('created_at', oldest)
      .limit(1000);
    const count = new Map<string, number>();
    for (const m of msgs ?? []) {
      if (m.sender_id === traineeOf.get(m.room_id) && m.created_at > (reads.get(m.room_id) || '')) count.set(m.room_id, (count.get(m.room_id) ?? 0) + 1);
    }
    for (const r of unreadRooms) r.unread = Math.max(1, count.get(r.roomId!) ?? 0);
  }

  const inView = all.filter((r) => (view === 'done' ? r.finished : !r.finished));
  const unreadIn = (done: boolean) => all.filter((r) => r.finished === done && r.unread > 0).length;
  const rows = inView
    .filter((r) => !q || r.name.includes(q) || r.kana.includes(q))
    // 並び順：最近やり取りした順 → まだやり取りがない人（フリガナ順）
    .sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? '') || a.kana.localeCompare(b.kana, 'ja'));

  const tab = (active: boolean) => `flex items-center justify-center gap-1.5 rounded-[9px] px-2 py-2 text-sm font-bold ${active ? 'surface shadow-sm text-brand-700' : 'muted'}`;
  const badge = (n: number) => n > 0 && <span className="min-w-5 rounded-full bg-red-500 px-1.5 text-center text-[11px] leading-5 text-white">{n > 99 ? '99+' : n}</span>;
  const viewQ = view === 'done' ? '?view=done' : '';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="line space-y-2.5 border-b p-3">
        <div role="tablist" aria-label="受講中と修了生" className="grid grid-cols-2 gap-1 rounded-xl bg-black/[0.06] p-1">
          <Link role="tab" aria-selected={view === 'current'} href="/admin/chat" className={tab(view === 'current')}>受講中{badge(unreadIn(false))}</Link>
          <Link role="tab" aria-selected={view === 'done'} href="/admin/chat?view=done" className={tab(view === 'done')}>修了生{badge(unreadIn(true))}</Link>
        </div>
        <form action="/admin/chat">
          {view === 'done' && <input type="hidden" name="view" value="done" />}
          <input name="q" defaultValue={q} placeholder="名前で検索" aria-label="名前で検索" className="w-full" />
        </form>
      </div>
      <ul className="line min-h-0 flex-1 divide-y overflow-y-auto">
        {rows.length === 0 && <li className="muted px-4 py-8 text-center text-sm">該当する訓練生はいません</li>}
        {rows.map((r) => {
          const active = !!activeRoomId && r.roomId === activeRoomId;
          return (
            <li key={r.traineeId}>
              <Link
                href={r.roomId ? `/admin/chat/${r.roomId}${viewQ}` : `/admin/chat/to/${r.traineeId}`}
                prefetch={false}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 px-3.5 py-3 ${active ? 'bg-brand-50' : 'hover:bg-black/[0.03]'}`}
              >
                <span aria-hidden className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold ${r.lastAt ? 'bg-brand-600 text-white' : 'bg-black/10'}`}>
                  {r.name.trim()[0] ?? '?'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate font-bold">{r.name}</span>
                    <span className="muted shrink-0 truncate text-[11px]">{r.courseName}</span>
                  </span>
                  <span className={`block truncate text-[13px] ${r.unread ? 'font-bold' : r.lastBody ? 'muted' : 'muted italic'}`}>
                    {r.lastBody ? `${r.lastFromStaff ? '事務局：' : ''}${r.lastBody}` : 'まだメッセージはありません'}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  {r.lastAt && <span className="muted text-[11px]">{friendlyDateTime(r.lastAt)}</span>}
                  {r.unread > 0 && (
                    <span aria-label={`未読${r.unread}件`} className="min-w-5 rounded-full bg-brand-600 px-1.5 text-center text-[11px] leading-5 font-bold text-white">
                      {r.unread > 99 ? '99+' : r.unread}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
