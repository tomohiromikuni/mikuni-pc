import Link from 'next/link';
import { requireStaff } from '@/lib/auth';

/** スマホの「その他」：下のタブに入らないメニュー */
export default async function MorePage() {
  const me = await requireStaff();
  const isAdmin = me.role === 'admin';
  const items = [
    { href: '/admin/surveys', label: '出欠・アンケート' },
    ...(isAdmin ? [{ href: '/admin/staff', label: 'スタッフ' }] : []),
    { href: '/admin/settings', label: '通知と設定' },
    ...(isAdmin ? [{ href: '/admin/setup', label: '設定チェック' }] : []),
  ];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">その他</h1>
      <ul className="surface divide-y line overflow-hidden rounded-2xl border">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="flex min-h-14 items-center justify-between px-4 font-bold hover:bg-black/5">
              {i.label}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
            </Link>
          </li>
        ))}
      </ul>
      <a
        href="/home"
        className="flex min-h-12 items-center justify-center rounded-2xl border-2 border-dashed border-brand-500 font-bold text-brand-700"
      >
        訓練生モードに切り替え
      </a>
      <form action="/auth/signout" method="post">
        <button className="surface min-h-12 w-full rounded-2xl border font-bold">ログアウト</button>
      </form>
      <p className="muted text-center text-xs">
        {me.full_name}（{isAdmin ? '管理者' : 'スタッフ'}）・バージョン {process.env.NEXT_PUBLIC_APP_VERSION}
        {process.env.NEXT_PUBLIC_BUILD_ID && ` (${process.env.NEXT_PUBLIC_BUILD_ID})`}
      </p>
    </div>
  );
}
