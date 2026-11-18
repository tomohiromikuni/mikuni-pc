'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

const TABS = [
  { href: '/home', label: 'ホーム', icon: 'M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
  { href: '/announcements', label: 'お知らせ', icon: 'M4 5h16v11H8l-4 4zM8 9h8M8 12h5' },
  { href: '/chat', label: 'チャット', icon: 'M4 4h16v12H9l-5 4zM8 9h.01M12 9h.01M16 9h.01' },
  { href: '/answers', label: '回答', icon: 'M9 4h6l1 2h3v15H5V6h3zM9 12l2 2 4-4' },
  { href: '/mypage', label: 'マイページ', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0' },
];

export function TraineeNav(initial: { unread: number; chatUnread?: number; todo?: number }) {
  const path = usePathname();
  const [counts, setCounts] = useState({ unread: initial.unread, chatUnread: initial.chatUnread ?? 0, todo: initial.todo ?? 0 });
  const { unread, chatUnread, todo } = counts;

  // 画面を移動するたびに未読数を数え直す（読んだのに数字が残らないように）
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const supabase = createClient();
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user.id;
      if (!uid) return;
      const [a, c, v] = await Promise.all([
        supabase.from('announcement_recipients').select('announcement_id', { count: 'exact', head: true }).eq('trainee_id', uid).is('read_at', null),
        supabase.rpc('my_chat_unread'),
        supabase.rpc('my_pending_surveys'),
      ]);
      if (!cancelled) setCounts({ unread: a.count ?? 0, chatUnread: (c.data as number) ?? 0, todo: (v.data as number) ?? 0 });
    }, 400); // 既読の記録が終わるのを少し待つ
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [path]);
  return (
    <nav
      aria-label="メインメニュー"
      className="surface fixed inset-x-0 bottom-0 z-10 border-t pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {TABS.map((t) => {
          const active = path === t.href || path.startsWith(t.href + '/');
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-bold ${
                  active ? 'text-brand-600' : 'muted'
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={t.icon} />
                </svg>
                {t.label}
                {(() => {
                  const n = t.href === '/announcements' ? unread : t.href === '/chat' ? chatUnread : t.href === '/answers' ? todo : 0;
                  return n > 0 ? (
                    <span className="absolute top-1.5 left-1/2 ml-2 min-w-5 rounded-full bg-red-500 px-1 text-center text-[11px] leading-5 text-white">
                      {n > 99 ? '99+' : n}
                    </span>
                  ) : null;
                })()}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
