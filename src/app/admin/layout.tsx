import { AdminNav } from '@/components/AdminNav';
import { requireStaff } from '@/lib/auth';
import { env } from '@/lib/env';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff();
  return (
    <div className="min-h-dvh md:flex">
      <aside className="surface border-b print:hidden md:sticky md:top-0 md:h-dvh md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-4 py-3 md:block">
          <div>
            <p className="font-bold text-brand-700">{env.appName}</p>
            <p className="muted text-xs">管理画面・{me.full_name}（{me.role === 'admin' ? '管理者' : 'スタッフ'}）</p>
          </div>
          <form action="/auth/signout" method="post" className="md:mt-2">
            <button className="muted text-sm underline">ログアウト</button>
          </form>
        </div>
        <div className="px-2 pb-2">
          <AdminNav isAdmin={me.role === 'admin'} />
        </div>
      </aside>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
