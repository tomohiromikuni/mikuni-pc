'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/admin', label: 'ダッシュボード', exact: true },
  { href: '/admin/announcements', label: 'お知らせ' },
  { href: '/admin/chat', label: 'チャット' },
  { href: '/admin/surveys', label: '出欠・アンケート' },
  { href: '/admin/trainees', label: '訓練生' },
  { href: '/admin/courses', label: 'コース・クラス', adminOnly: true },
  { href: '/admin/staff', label: 'スタッフ', adminOnly: true },
  { href: '/admin/settings', label: '通知と設定' },
  { href: '/admin/audit', label: '操作ログ', adminOnly: true },
  { href: '/admin/setup', label: '設定チェック', adminOnly: true },
];

export function AdminNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  return (
    <nav aria-label="管理メニュー" className="flex gap-1 overflow-x-auto md:flex-col">
      {ITEMS.filter((i) => isAdmin || !i.adminOnly).map((i) => {
        const active = i.exact ? path === i.href : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? 'page' : undefined}
            className={`shrink-0 rounded-xl px-4 py-2.5 font-bold ${active ? 'bg-brand-600 text-white' : 'hover:bg-black/5'}`}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
