'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { uploadAttachment } from '@/lib/upload';

/** チャットの共通処理：新着・既読の即時反映と、メッセージ（＋添付）の送信 */
export function useChatRoom(roomId: string, orgId: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc('mark_chat_read', { p_room: roomId });
    const ch = supabase
      .channel(`room-${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` }, () => {
        supabase.rpc('mark_chat_read', { p_room: roomId }).then(() => router.refresh());
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reads', filter: `room_id=eq.${roomId}` }, () => router.refresh())
      .subscribe();
    // スマホでアプリを切り替えて戻ってきたときにも最新化
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        supabase.rpc('mark_chat_read', { p_room: roomId });
        router.refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      supabase.removeChannel(ch);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [roomId, router]);

  /** 送信。成功したら true */
  async function send(text: string, files: File[]): Promise<boolean> {
    if (!text.trim() && files.length === 0) return false;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from('chat_messages')
      .insert({ org_id: orgId, room_id: roomId, body: text.trim() })
      .select('id')
      .single();
    if (err || !data) {
      setError('送信できませんでした。通信状況を確認してもう一度お試しください');
      setBusy(false);
      return false;
    }
    const errs: string[] = [];
    for (const f of files) {
      const r = await uploadAttachment(f, { orgId, folder: `chat/${roomId}`, kind: 'chat', messageId: data.id });
      if (r.error) errs.push(r.error);
    }
    if (errs.length) setError(errs.join(' / '));
    setBusy(false);
    router.refresh();
    return true;
  }

  return { send, busy, error };
}

const TZ = 'Asia/Tokyo';
export const chatDayKey = (iso: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date(iso));
export const chatTime = (iso: string) => new Intl.DateTimeFormat('ja-JP', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
/** 日付の区切り：今日 / 昨日 / 11/19(水) */
export function chatDayLabel(iso: string, now = new Date()): string {
  const k = chatDayKey(iso);
  if (k === chatDayKey(now.toISOString())) return '今日';
  if (k === chatDayKey(new Date(now.getTime() - 86400000).toISOString())) return '昨日';
  return new Intl.DateTimeFormat('ja-JP', { timeZone: TZ, month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(iso));
}
