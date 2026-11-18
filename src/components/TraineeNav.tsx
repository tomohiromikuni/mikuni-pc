'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/home', label: 'ホーム', icon: 'M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
  { href: '/announcements', label: 'お知らせ', icon: 'M4 5h16v11H8l-4 4zM8 9h8M8 12h5' },
  { href: '/chat', label: 'チャット', icon: 'M4 4h16v12H9l-5 4zM8 9h.01M12 9h.01M16 9h.01' },
  { href: '/answers', label: '回答', icon: 'M9 4h6l1 2h3v15H5V6h3zM9 12l2 2 4-4' },
  { href: '/mypage', label: 'マイページ', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0' },
];

export function TraineeNav({ unread }: { unread: number }) {
  const path = usePathname();
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
                {t.href === '/announcements' && unread > 0 && (
                  <span className="absolute top-1.5 left-1/2 ml-2 min-w-5 rounded-full bg-red-500 px-1 text-center text-[11px] leading-5 text-white">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
