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
    const preview = me.role !== 'trainee' && !me.also_trainee;
    return (
      <div className="p-6">
        <Link href="/home" className="font-bold text-brand-700">‹ ホームへ</Link>
        <p className={`mt-4 ${preview ? '' : 'text-red-700'}`}>
          {preview
            ? '訓練生モード（表示の確認用）では、チャットは使えません。訓練生のチャット画面は、管理画面の「チャット」から確認できます。'
            : 'チャットを開けませんでした。時間をおいてお試しください。'}
        </p>
      </div>
    );
  }
  // 開いた時点で既読にする（下のタブの数字を消すため）
  const [{ messages, staffRead }] = await Promise.all([loadThread(roomId, me.id), supabase.rpc('mark_chat_read', { p_room: roomId })]);
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
