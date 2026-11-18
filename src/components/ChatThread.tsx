'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { ACCEPT, uploadAttachment } from '@/lib/upload';
import type { ChatMessage } from '@/lib/chat';

const TZ = 'Asia/Tokyo';
const dayKey = (iso: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date(iso));
const dayLabel = (iso: string) => new Intl.DateTimeFormat('ja-JP', { timeZone: TZ, month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(iso));
const time = (iso: string) => new Intl.DateTimeFormat('ja-JP', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

export function ChatThread({
  roomId,
  orgId,
  meId,
  viewer,
  messages,
  otherReadAt,
}: {
  roomId: string;
  orgId: string;
  meId: string;
  viewer: 'trainee' | 'staff';
  messages: ChatMessage[];
  otherReadAt: string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  // 新しいメッセージ・既読をすぐ反映（権限のある人にだけ届く）
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
    // 画面に戻ってきたときにも最新化（スマホでアプリを切り替えた場合など）
    const onVisible = () => document.visibilityState === 'visible' && router.refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      supabase.removeChannel(ch);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [roomId, router]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() && files.length === 0) return;
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
      return;
    }
    const errs: string[] = [];
    for (const f of files) {
      const r = await uploadAttachment(f, { orgId, folder: `chat/${roomId}`, kind: 'chat', messageId: data.id });
      if (r.error) errs.push(r.error);
    }
    if (errs.length) setError(errs.join(' / '));
    setText('');
    setFiles([]);
    setBusy(false);
    router.refresh();
  }

  let lastDay = '';
  const lastMine = [...messages].reverse().find((m) => m.sender_id === meId);

  return (
    <div className="flex flex-col">
      <div className="space-y-2 pb-4">
        {messages.length === 0 && (
          <p className="muted py-10 text-center text-sm">
            {viewer === 'trainee' ? '事務局への質問・相談・連絡はこちらからどうぞ。' : 'まだメッセージはありません。'}
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === meId;
          const showDay = dayKey(m.created_at) !== lastDay;
          lastDay = dayKey(m.created_at);
          const name = viewer === 'trainee' ? (m.sender_is_staff ? '事務局' : '') : m.sender_name;
          return (
            <div key={m.id}>
              {showDay && (
                <p className="my-3 text-center">
                  <span className="rounded-full bg-black/10 px-3 py-0.5 text-xs">{dayLabel(m.created_at)}</span>
                </p>
              )}
              <div className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                <div className={`max-w-[78%] space-y-1 ${mine ? 'items-end text-right' : ''}`}>
                  {!mine && name && <p className="muted text-xs">{name}</p>}
                  {m.body && (
                    <p
                      className={`inline-block rounded-2xl px-4 py-2 text-left whitespace-pre-wrap break-words ${
                        mine ? 'rounded-br-sm bg-brand-600 text-white' : 'surface rounded-bl-sm border'
                      }`}
                    >
                      {m.body}
                    </p>
                  )}
                  {m.attachments.map((a) =>
                    a.mime_type.startsWith('image/') && a.url ? (
                      <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.url} alt={a.file_name} className={`max-h-64 rounded-xl border line ${mine ? 'ml-auto' : ''}`} />
                      </a>
                    ) : (
                      <a key={a.id} href={a.url ?? '#'} target="_blank" rel="noreferrer" className="surface block rounded-xl border px-3 py-2 text-left text-sm underline">
                        📄 {a.file_name}
                      </a>
                    ),
                  )}
                </div>
                <div className="muted shrink-0 pb-1 text-[11px] leading-tight">
                  {mine && lastMine?.id === m.id && otherReadAt && otherReadAt >= m.created_at && <div>既読</div>}
                  {time(m.created_at)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      <form onSubmit={send} className={`surface sticky z-[5] -mx-4 border-t px-3 py-2 ${viewer === 'trainee' ? 'bottom-[calc(4rem+env(safe-area-inset-bottom))]' : 'bottom-0'}`}>
        {error && <p className="mb-1 text-sm font-semibold text-red-700">{error}</p>}
        {files.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-2 text-xs">
            {files.map((f, i) => (
              <span key={i} className="rounded-full bg-black/10 px-2 py-0.5">
                {f.name} <button type="button" aria-label="外す" onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-black/5" aria-label="写真・ファイルを添付">
            <span aria-hidden className="text-xl">📎</span>
            <input type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} />
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={1}
            maxLength={4000}
            placeholder="メッセージを入力"
            aria-label="メッセージ"
            className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl"
            onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 160) + 'px'; }}
          />
          <button
            type="submit"
            disabled={busy || (!text.trim() && files.length === 0)}
            className="h-11 shrink-0 rounded-full bg-brand-600 px-5 font-bold text-white disabled:opacity-40"
          >
            {busy ? '…' : '送信'}
          </button>
        </div>
      </form>
    </div>
  );
}
