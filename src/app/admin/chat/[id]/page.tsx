import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChatThread } from '@/components/ChatThread';
import { Button, Card } from '@/components/ui';
import { requirePerm } from '@/lib/auth';
import { CHAT_STATUS_LABEL, loadThread } from '@/lib/chat';
import { friendlyDateTime } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { addChatNote, setChatStatus } from '../actions';

export default async function ChatRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requirePerm('chat');
  const { id } = await params;
  const supabase = await createClient();
  const { data: room } = await supabase
    .from('chat_rooms')
    .select('id, org_id, status, trainee_id, profiles!chat_rooms_trainee_id_fkey(full_name, full_name_kana)')
    .eq('id', id)
    .maybeSingle();
  if (!room) notFound();
  const [{ messages, traineeRead }, { data: notes }] = await Promise.all([
    loadThread(id, room.trainee_id),
    supabase.from('chat_notes').select('id, body, created_at, profiles!chat_notes_author_id_fkey(full_name)').eq('room_id', id).order('created_at'),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = room.profiles as any;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div>
        <Link href="/admin/chat" className="text-sm font-bold text-brand-700">‹ チャット一覧</Link>
        <div className="mt-2 mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold">
            <Link href={`/admin/trainees/${room.trainee_id}`} className="hover:underline">{t?.full_name}</Link> さん
          </h1>
          <form action={setChatStatus.bind(null, id)} className="flex items-center gap-2">
            <select name="status" defaultValue={room.status} aria-label="対応状態" className="w-auto py-1">
              {Object.entries(CHAT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <Button type="submit" variant="secondary" className="min-h-9 px-3 py-1 text-sm">変更</Button>
          </form>
        </div>
        <ChatThread roomId={id} orgId={room.org_id} meId={me.id} viewer="staff" messages={messages} otherReadAt={traineeRead} />
      </div>
      <aside className="space-y-3">
        <Card>
          <h2 className="mb-2 font-bold">スタッフ用メモ</h2>
          <p className="muted mb-2 text-xs">訓練生には表示されません。引き継ぎなどに使ってください。</p>
          <ul className="mb-3 space-y-2 text-sm">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(notes ?? []).map((n: any) => (
              <li key={n.id} className="rounded-lg bg-amber-50 p-2 text-amber-950">
                <p className="whitespace-pre-wrap">{n.body}</p>
                <p className="mt-1 text-[11px] opacity-70">{n.profiles?.full_name}・{friendlyDateTime(n.created_at)}</p>
              </li>
            ))}
          </ul>
          <form action={addChatNote.bind(null, id)} className="space-y-2">
            <textarea name="body" rows={2} maxLength={2000} aria-label="メモ" required />
            <Button type="submit" variant="secondary" className="w-full">メモを追加</Button>
          </form>
        </Card>
      </aside>
    </div>
  );
}
