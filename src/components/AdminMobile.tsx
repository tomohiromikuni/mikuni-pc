'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/browser';

/** チャットの部屋の中（全画面で表示する画面）か */
const isRoom = (path: string) => /^\/admin\/chat\/[^/]+$/.test(path) && !path.startsWith('/admin/chat/to');

/** スマホ用：上の帯（チャットの部屋の中では出さない） */
export function AdminMobileHeader({ name, roleLabel }: { name: string; roleLabel: string }) {
  const path = usePathname();
  if (isRoom(path)) return null;
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 bg-[#1f2a26] px-4 pt-[env(safe-area-inset-top)] text-white md:hidden print:hidden">
      <span className="flex-1 text-[17px] font-bold">管理画面</span>
      <span className="text-xs opacity-80">{name}（{roleLabel}）</span>
    </header>
  );
}

/** 本文：チャットの部屋の中では余白なしの全画面にする */
export function AdminMain({ children }: { children: ReactNode }) {
  const path = usePathname();
  const room = isRoom(path);
  // チャットは「左に一覧・右にトーク」なので横幅を広く使う
  const wide = path === '/admin/chat' || path.startsWith('/admin/chat/');
  return (
    <main className={`mx-auto w-full flex-1 md:px-4 md:py-6 ${wide ? 'max-w-7xl' : 'max-w-5xl'} ${room ? 'max-md:p-0' : 'px-4 py-4 pb-28 md:pb-6'}`}>{children}</main>
  );
}

const TABS = [
  { href: '/admin/chat', label: 'チャット', icon: 'M4 4h16v12H9l-5 4z' },
  { href: '/admin/announcements', label: 'お知らせ', icon: 'M4 5h16v11H8l-4 4z' },
  { href: '/admin/surveys', label: '出欠', icon: 'M9 11l3 3 8-8M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11' },
  { href: '/admin/trainees', label: '訓練生', icon: 'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .8 3.5 2.8 3.5 5.5' },
  { href: '/admin/more', label: 'その他', icon: 'M4 7h16M4 12h16M4 17h16' },
];

/** スマホ用：下のタブ（チャットには未読の件数を表示） */
export function AdminBottomNav({ initialReply, canChat }: { initialReply: number; canChat: boolean }) {
  const path = usePathname();
  const [reply, setReply] = useState(initialReply);

  // 画面を移動するたびに未読の数を数え直す
  useEffect(() => {
    if (!canChat) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user.id;
      const { data } = await supabase.from('chat_rooms').select('last_message_at, chat_reads(user_id, last_read_at)').eq('last_sender_role', 'trainee');
      if (cancelled || !data) return;
      setReply(
        data.filter((r) => {
          const mine = (r.chat_reads ?? []).find((x: { user_id: string }) => x.user_id === uid)?.last_read_at;
          return !mine || mine < (r.last_message_at ?? '');
        }).length,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [path, canChat]);

  if (isRoom(path)) return null;
  return (
    <nav aria-label="管理メニュー" className="surface fixed inset-x-0 bottom-0 z-20 border-t pb-[env(safe-area-inset-bottom)] md:hidden print:hidden">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${canChat ? 5 : 4}, minmax(0, 1fr))` }}>
        {TABS.filter((t) => canChat || t.href !== '/admin/chat').map((t) => {
          const active = path === t.href || path.startsWith(t.href + '/') || (t.href === '/admin/more' && /^\/admin\/(settings|staff|setup)(\/|$)/.test(path));
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${active ? 'text-brand-600' : 'muted'}`}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={t.icon} />
                </svg>
                {t.label}
                {t.href === '/admin/chat' && reply > 0 && (
                  <span className="absolute top-1.5 left-1/2 ml-2 min-w-5 rounded-full bg-red-500 px-1 text-center text-[11px] leading-5 text-white">{reply > 99 ? '99+' : reply}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
