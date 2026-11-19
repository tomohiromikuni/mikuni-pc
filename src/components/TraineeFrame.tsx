'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { TraineeNav } from '@/components/TraineeNav';

/** 訓練生画面の枠（上の帯・下のタブ）。チャット画面だけは全画面にする */
export function TraineeFrame({ appName, unread, chatUnread, todo, staffMode = false, graduate = false, children }: { appName: string; unread: number; chatUnread: number; todo: number; staffMode?: boolean; graduate?: boolean; children: ReactNode }) {
  const path = usePathname();
  // 確認画面（端末の枠）の中で表示しているときは、上の帯を出さない
  const [framed, setFramed] = useState(false);
  useEffect(() => setFramed(window.self !== window.top), []);
  if (framed) staffMode = false;
  const modeBar = staffMode && (
    <div className="sticky top-0 z-20 flex items-center justify-between gap-2 bg-[#1f2a26] px-4 py-1.5 pt-[calc(0.375rem+env(safe-area-inset-top))] text-sm text-white">
      <span className="font-bold">訓練生の画面を表示中</span>
      <a href="/admin" className="rounded-full bg-white/15 px-3 py-1 font-bold text-white hover:bg-white/25">管理画面に戻る</a>
    </div>
  );
  // 訓練生モードの帯がある分だけ、全画面チャットの高さを縮める
  if (path === '/chat') return <div style={staffMode ? ({ '--chat-h': 'calc(100dvh - 2.75rem - env(safe-area-inset-top))' } as CSSProperties) : undefined}>{modeBar}{children}</div>;
  // 修了生：タブなしの1画面（ホーム以外は「ホームへ戻る」だけ）
  if (graduate) {
    if (path === '/home') return <>{children}</>;
    return (
      <div className="min-h-dvh bg-[#f7f3ec]">
        <div className="sticky top-0 z-10 bg-[#f7f3ec] px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-2">
          <a href="/home" className="text-sm font-bold text-brand-700">‹ ホームへ戻る</a>
        </div>
        <main className="mx-auto max-w-2xl px-4 pb-10">{children}</main>
      </div>
    );
  }
  // ホームは独自の大きな見出しがあるので、上の帯は出さない
  const showBar = path !== '/home';
  return (
    <div className="min-h-dvh pb-24">
      {modeBar}
      {showBar && <header className="sticky top-0 z-10 bg-brand-600 pt-[env(safe-area-inset-top)] text-white">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-4">
          <span className="text-lg font-bold">{appName}</span>
        </div>
      </header>}
      <main className="mx-auto max-w-2xl px-4 py-4">{children}</main>
      <TraineeNav unread={unread} chatUnread={chatUnread} todo={todo} />
    </div>
  );
}
