import { ChatThread } from '@/components/ChatThread';
import { requireTrainee } from '@/lib/auth';
import { loadThread } from '@/lib/chat';
import { createClient } from '@/lib/supabase/server';

export default async function ChatPage() {
  const me = await requireTrainee();
  const supabase = await createClient();
  const { data: roomId, error } = await supabase.rpc('ensure_my_chat_room');
  if (error || !roomId) return <p className="text-red-700">チャットを開けませんでした。時間をおいてお試しください。</p>;
  const { messages, staffRead } = await loadThread(roomId, me.id);
  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">事務局チャット</h1>
      <p className="muted mb-3 text-xs">ここでのやり取りは、あなたと事務局の担当者だけが見られます。返信は平日の日中に行います。</p>
      <ChatThread roomId={roomId} orgId={me.org_id} meId={me.id} viewer="trainee" messages={messages} otherReadAt={staffRead} />
    </div>
  );
}
