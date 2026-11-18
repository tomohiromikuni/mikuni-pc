'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { uploadAttachment } from '@/lib/upload';

/**
 * チャットの共通処理：新着・既読を自動で反映し、メッセージ（＋添付）を送信する
 *  1. リアルタイム受信（ログイン情報を渡して購読。権限のある人にだけ届く）
 *  2. 念のため、画面を開いている間は数秒ごとに新着を確認（受信が切れても必ず更新される）
 */
export function useChatRoom(roomId: string, orgId: string, latest: { messageAt: string | null; readAt: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const known = useRef(latest);
  known.current = latest;

  useEffect(() => {
    const supabase = createClient();
    let stopped = false;
    let refreshing = false;
    const refresh = () => {
      if (refreshing) return;
      refreshing = true;
      supabase.rpc('mark_chat_read', { p_room: roomId }).then(() => {
        router.refresh();
        setTimeout(() => (refreshing = false), 800);
      });
    };

    // 1. リアルタイム受信
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) await supabase.realtime.setAuth(data.session.access_token);
      if (stopped) return;
      channel = supabase
        .channel(`room-${roomId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reads', filter: `room_id=eq.${roomId}` }, () => router.refresh())
        .subscribe();
    })();
    supabase.rpc('mark_chat_read', { p_room: roomId });

    // 2. 数秒ごとの確認（画面が表示されている間だけ）
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      const [{ data: m }, { data: r }] = await Promise.all([
        supabase.from('chat_messages').select('created_at').eq('room_id', roomId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('chat_reads').select('last_read_at').eq('room_id', roomId).order('last_read_at', { ascending: false }),
      ]);
      const newMsg = m?.created_at && m.created_at !== known.current.messageAt;
      // 相手の既読が進んだか（自分の既読は除外できないので、最新の値が変わったら更新）
      const reads = (r ?? []).map((x) => x.last_read_at).join(',');
      const readsChanged = lastReads !== null && reads !== lastReads;
      lastReads = reads;
      if (newMsg) refresh();
      else if (readsChanged) router.refresh();
    };
    let lastReads: string | null = null;
    const timer = setInterval(poll, 4000);

    // スマホでアプリを切り替えて戻ってきたら、すぐ確認
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      if (channel) supabase.removeChannel(channel);
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
