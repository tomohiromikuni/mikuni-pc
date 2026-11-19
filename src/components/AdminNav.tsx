'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SETTINGS_PATHS = ['/admin/settings', '/admin/staff', '/admin/setup'];

const ITEMS = [
  { href: '/admin/chat', label: 'チャット' },
  { href: '/admin/announcements', label: 'お知らせ' },
  { href: '/admin/surveys', label: '出欠・アンケート' },
  { href: '/admin/trainees', label: '訓練生' },
  { href: '/admin/settings', label: '設定', match: SETTINGS_PATHS },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="管理メニュー" className="flex gap-1 overflow-x-auto md:flex-col">
      {ITEMS.map((i) => {
        const active = (i.match ?? [i.href]).some((h) => path === h || path.startsWith(h + '/'));
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

/** 「設定」の中のタブ（通知と休みの日・スタッフ・設定チェック） */
export function SettingsTabs({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const tabs = [
    { href: '/admin/settings', label: '通知・休みの日' },
    ...(isAdmin ? [{ href: '/admin/staff', label: 'スタッフ' }, { href: '/admin/setup', label: '設定チェック' }] : []),
  ];
  return (
    <div className="mb-4 space-y-3">
      <h1 className="text-xl font-bold">設定</h1>
      {tabs.length > 1 && (
        <nav aria-label="設定の項目" className="line flex gap-1 overflow-x-auto border-b">
          {tabs.map((t) => {
            const active = path === t.href || path.startsWith(t.href + '/');
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-bold ${active ? 'border-brand-600 text-brand-700' : 'muted border-transparent'}`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
