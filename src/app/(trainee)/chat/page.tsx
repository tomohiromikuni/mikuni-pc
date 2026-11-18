import Link from 'next/link';
import { ChatThread } from '@/components/ChatThread';
import { requireTrainee } from '@/lib/auth';
import { loadThread } from '@/lib/chat';
import { createClient } from '@/lib/supabase/server';

export default async function ChatPage() {
  const me = await requireTrainee();
  const supabase = await createClient();
  const { data: roomId, error } = await supabase.rpc('ensure_my_chat_room');
  if (error || !roomId) {
    return (
      <div className="p-6">
        <Link href="/home" className="font-bold text-brand-700">‹ ホームへ</Link>
        <p className="mt-4 text-red-700">チャットを開けませんでした。時間をおいてお試しください。</p>
      </div>
    );
  }
  const { messages, staffRead } = await loadThread(roomId, me.id);
  return (
    <ChatThread
      roomId={roomId}
      orgId={me.org_id}
      meId={me.id}
      viewer="trainee"
      messages={messages}
      otherReadAt={staffRead}
      fullScreen
      header={
        <>
          <Link href="/home" aria-label="ホームに戻る" className="flex h-11 w-11 items-center justify-center text-white">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[17px] leading-tight font-bold">事務局</p>
            <p className="text-[11px] opacity-90">平日 9:00〜18:00 に返信します</p>
          </div>
        </>
      }
    />
  );
}
