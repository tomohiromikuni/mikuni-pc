'use client';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { TraineeNav } from '@/components/TraineeNav';

/** 訓練生画面の枠（上の帯・下のタブ）。チャット画面だけは全画面にする */
export function TraineeFrame({ appName, unread, chatUnread, todo, children }: { appName: string; unread: number; chatUnread: number; todo: number; children: ReactNode }) {
  const path = usePathname();
  if (path === '/chat') return <>{children}</>;
  // ホームは独自の大きな見出しがあるので、上の帯は出さない
  const showBar = path !== '/home';
  return (
    <div className="min-h-dvh pb-24">
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
