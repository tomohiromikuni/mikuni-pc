'use client';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { ChatMessage } from '@/lib/chat';
import { ACCEPT } from '@/lib/upload';
import { chatDayKey, chatDayLabel, chatTime, useChatRoom } from '@/lib/use-chat';

/**
 * チャット画面（デザイン案A：LINE風）
 *  - 訓練生側：自分＝右、事務局＝左（アイコン「事」＋担当者名）
 *  - 学校側：事務局（自分以外のスタッフも含む）＝右、訓練生＝左
 */
export function ChatThread({
  roomId,
  orgId,
  meId,
  viewer,
  messages,
  otherReadAt,
  header,
  traineeName = '',
  fullScreen = false,
}: {
  roomId: string;
  orgId: string;
  meId: string;
  viewer: 'trainee' | 'staff';
  messages: ChatMessage[];
  otherReadAt: string | null;
  header: ReactNode;
  traineeName?: string;
  fullScreen?: boolean;
}) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const { send, busy, error } = useChatRoom(roomId, orgId);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  // 新しいメッセージが来たら一番下へ
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (await send(text, files)) {
      setText('');
      setFiles([]);
      if (input.current) input.current.style.height = '';
    }
  }

  const isRight = (m: ChatMessage) => (viewer === 'trainee' ? m.sender_id === meId : m.sender_is_staff);
  const family = (name: string) => name.split(/[\s　]/)[0] || name;
  const leftAvatar = viewer === 'trainee' ? '事' : (traineeName.trim()[0] ?? '訓');
  const leftName = (m: ChatMessage) => (viewer === 'trainee' ? `事務局 ${family(m.sender_name)}` : m.sender_name);
  let lastDay = '';

  return (
    <div className={`flex flex-col overflow-hidden bg-[#e9eef3] text-[#1f2a26] ${fullScreen ? 'h-dvh' : 'h-[calc(100dvh-170px)] min-h-[520px] rounded-2xl border line'}`}>
      <header className="flex min-h-14 shrink-0 items-center gap-2 bg-brand-600 px-2 pt-[env(safe-area-inset-top)] text-white">{header}</header>

      <div ref={scroller} className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3" aria-live="polite">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-[#4d5a55]">
            {viewer === 'trainee' ? '事務局への質問・相談・連絡はこちらからどうぞ。' : 'まだメッセージはありません。'}
          </p>
        )}
        {messages.map((m) => {
          const right = isRight(m);
          const showDay = chatDayKey(m.created_at) !== lastDay;
          lastDay = chatDayKey(m.created_at);
          const read = right && !!otherReadAt && otherReadAt >= m.created_at;
          // 学校側：自分以外のスタッフが送ったものは名前を小さく表示
          const rightName = viewer === 'staff' && m.sender_id !== meId ? m.sender_name : '';
          return (
            <div key={m.id}>
              {showDay && (
                <p className="my-2 text-center">
                  <span className="rounded-full bg-[rgba(31,42,38,0.28)] px-3 py-0.5 text-xs text-white">{chatDayLabel(m.created_at)}</span>
                </p>
              )}
              {right ? (
                <div className="flex flex-col items-end gap-0.5">
                  {rightName && <p className="mr-1 text-[11px] text-[#4d5a55]">{rightName}</p>}
                  <div className="flex items-end justify-end gap-1.5">
                    <div className="flex shrink-0 flex-col items-end text-[10px] leading-tight text-[#4d5a55]">
                      {read && <span>既読</span>}
                      <span>{chatTime(m.created_at)}</span>
                    </div>
                    <Bubble m={m} side="right" />
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[13px] font-bold text-white">
                    {leftAvatar}
                  </span>
                  <div className="flex min-w-0 max-w-[78%] flex-col gap-0.5">
                    <p className="text-[11px] text-[#4d5a55]">{leftName(m)}</p>
                    <div className="flex items-end gap-1.5">
                      <Bubble m={m} side="left" />
                      <span className="shrink-0 text-[10px] text-[#4d5a55]">{chatTime(m.created_at)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <form onSubmit={onSubmit} className={`shrink-0 border-t border-[#dfe5e2] bg-white px-2 pt-2 ${fullScreen ? 'pb-[calc(0.5rem+env(safe-area-inset-bottom))]' : 'pb-2'}`}>
        {error && <p className="mb-1 px-1 text-sm font-semibold text-red-700">{error}</p>}
        {files.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-2 px-1 text-xs">
            {files.map((f, i) => (
              <span key={i} className="rounded-full bg-[#eef2f1] px-2 py-0.5">
                {f.name}
                <button type="button" aria-label={`${f.name}を外す`} className="ml-1" onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-1">
          <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#4d5a55] hover:bg-black/5" aria-label="写真・ファイルを送る">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            <input type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} />
          </label>
          <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#4d5a55] hover:bg-black/5" aria-label="カメラで撮って送る">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} />
          </label>
          <textarea
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={1}
            maxLength={4000}
            placeholder="メッセージを入力"
            aria-label="メッセージ"
            className="max-h-36 min-h-10 flex-1 resize-none rounded-[20px] border-0 bg-[#eef2f1] px-4 py-2 leading-6"
            onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 144) + 'px'; }}
          />
          <button
            type="submit"
            aria-label="送信"
            disabled={busy || (!text.trim() && files.length === 0)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white disabled:opacity-40"
          >
            {busy ? (
              <span className="text-sm">…</span>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12l16-8-6 16-3-7z" /></svg>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

/** 吹き出し（文章・画像・ファイル） */
function Bubble({ m, side }: { m: ChatMessage; side: 'left' | 'right' }) {
  const right = side === 'right';
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${right ? 'max-w-[72vw] items-end sm:max-w-md' : 'items-start'}`}>
      {m.body && (
        <p
          className={`px-3.5 py-2 text-[15px] leading-relaxed whitespace-pre-wrap break-words ${
            right ? 'rounded-[18px] rounded-tr-[4px] bg-[#b9efd7]' : 'rounded-[18px] rounded-tl-[4px] bg-white'
          }`}
        >
          {m.body}
        </p>
      )}
      {m.attachments.map((a) =>
        a.mime_type.startsWith('image/') && a.url ? (
          <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.url} alt={a.file_name} className="max-h-60 max-w-[60vw] rounded-[14px] sm:max-w-xs" />
          </a>
        ) : (
          <a key={a.id} href={a.url ?? '#'} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-[14px] bg-white px-3 py-2 text-sm">
            <span aria-hidden className="rounded bg-red-600 px-1 text-[10px] font-bold text-white">{a.mime_type === 'application/pdf' ? 'PDF' : 'FILE'}</span>
            <span className="truncate underline">{a.file_name}</span>
          </a>
        ),
      )}
    </div>
  );
}
