'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requirePerm } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export async function openChatWithTrainee(traineeId: string) {
  await requirePerm('chat');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('ensure_chat_room', { p_trainee: traineeId });
  if (error || !data) redirect(`/admin/trainees/${traineeId}?error=` + encodeURIComponent('チャットを開けませんでした：' + error?.message));
  redirect(`/admin/chat/${data}`);
}

export async function setChatStatus(roomId: string, f: FormData) {
  await requirePerm('chat');
  const status = String(f.get('status'));
  if (!['open', 'in_progress', 'done'].includes(status)) return;
  const supabase = await createClient();
  await supabase.from('chat_rooms').update({ status }).eq('id', roomId);
  revalidatePath(`/admin/chat/${roomId}`);
}

export async function addChatNote(roomId: string, f: FormData) {
  await requirePerm('chat');
  const body = String(f.get('body') ?? '').trim();
  if (!body) return;
  const supabase = await createClient();
  await supabase.from('chat_notes').insert({ room_id: roomId, body });
  revalidatePath(`/admin/chat/${roomId}`);
}
