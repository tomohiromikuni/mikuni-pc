import { redirect } from 'next/navigation';
import { requirePerm } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

/** 一覧で「まだチャットしたことがない人」を押したとき：部屋を用意してチャット画面へ */
export default async function OpenChatPage({ params }: { params: Promise<{ traineeId: string }> }) {
  await requirePerm('chat');
  const { traineeId } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('ensure_chat_room', { p_trainee: traineeId });
  if (error || !data) redirect('/admin/chat?error=' + encodeURIComponent('チャットを開けませんでした：' + (error?.message ?? '')));
  redirect(`/admin/chat/${data}`);
}
