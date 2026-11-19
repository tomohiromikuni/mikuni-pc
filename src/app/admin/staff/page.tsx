import { SettingsTabs } from '@/components/AdminNav';
import Link from 'next/link';
import { StaffAddDialog } from '@/components/StaffAddDialog';
import { Card, Notice, PageTitle, type Flash } from '@/components/ui';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { STATUS_LABEL, type AccountStatus } from '@/lib/types';

/** スタッフ一覧（役割は「管理者」と「メンバー」の2つだけ） */
export default async function StaffPage({ searchParams }: { searchParams: Promise<Flash> }) {
  await requireAdmin();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('id, full_name, role, status').in('role', ['admin', 'staff']).order('role').order('full_name');
  return (
    <div className="space-y-4">
      <SettingsTabs isAdmin />
      <PageTitle action={<StaffAddDialog />}>スタッフ</PageTitle>
      <Notice error={sp.error} message={sp.message} />
      <Card className="p-0">
        <ul className="line divide-y">
          {(data ?? []).map((s) => (
            <li key={s.id}>
              <Link href={`/admin/staff/${s.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-black/5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700" aria-hidden>
                  {s.full_name.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1 truncate font-bold">{s.full_name}</span>
                <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${s.role === 'admin' ? 'bg-brand-600 text-white' : 'bg-black/5'}`}>
                  {s.role === 'admin' ? '管理者' : 'メンバー'}
                </span>
                {s.status !== 'active' && <span className="muted w-16 text-right text-xs">{STATUS_LABEL[s.status as AccountStatus]}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <p className="muted text-xs">メンバーは、削除とスタッフの管理以外はすべて使えます。管理者はすべての機能が使えます。</p>
    </div>
  );
}
