import 'server-only';
import { withSignedUrls, type AttachmentView } from '@/lib/attachments';
import { createClient } from '@/lib/supabase/server';

export type ChatMessage = {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_is_staff: boolean;
  body: string;
  created_at: string;
  attachments: AttachmentView[];
};

/** ルームのメッセージ（最新200件）と、相手の既読位置 */
export async function loadThread(roomId: string, traineeId: string) {
  const supabase = await createClient();
  const [{ data: msgs }, { data: reads }] = await Promise.all([
    supabase
      .from('chat_messages')
      .select('id, sender_id, body, created_at, profiles!chat_messages_sender_id_fkey(full_name, role), attachments(id, file_name, mime_type, size_bytes, storage_path)')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('chat_reads').select('user_id, last_read_at').eq('room_id', roomId),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (msgs ?? []).reverse() as any[];
  const allAtt = rows.flatMap((m) => m.attachments ?? []);
  const signed = new Map((await withSignedUrls(allAtt)).map((a) => [a.id, a]));
  const messages: ChatMessage[] = rows.map((m) => ({
    id: m.id,
    sender_id: m.sender_id,
    sender_name: m.profiles?.full_name ?? '',
    sender_is_staff: m.profiles?.role !== 'trainee',
    body: m.body,
    created_at: m.created_at,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attachments: (m.attachments ?? []).map((a: any) => signed.get(a.id)!).filter(Boolean),
  }));
  const traineeRead = (reads ?? []).find((r) => r.user_id === traineeId)?.last_read_at ?? null;
  const staffRead = (reads ?? []).filter((r) => r.user_id !== traineeId).map((r) => r.last_read_at).sort().pop() ?? null;
  return { messages, traineeRead, staffRead };
}

export const CHAT_STATUS_LABEL = { open: '未対応', in_progress: '対応中', done: '完了' } as const;
export type ChatStatus = keyof typeof CHAT_STATUS_LABEL;
