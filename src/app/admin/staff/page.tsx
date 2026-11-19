import { SettingsTabs } from '@/components/AdminNav';
import Link from 'next/link';
import { Card, LinkButton, Notice, PageTitle, type Flash } from '@/components/ui';
import { requireAdmin } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { STATUS_LABEL, type AccountStatus } from '@/lib/types';

export default async function StaffPage({ searchParams }: { searchParams: Promise<Flash> }) {
  await requireAdmin();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, role, status, staff_permissions(permission), staff_scopes(course_id, class_id, courses(name), classes(name))')
    .in('role', ['admin', 'staff'])
    .order('role')
    .order('full_name');
  return (
    <div className="space-y-4">
      <SettingsTabs isAdmin />
      <PageTitle action={<LinkButton href="/admin/staff/new">＋ スタッフを追加</LinkButton>}>スタッフ・管理者</PageTitle>
      <Notice error={sp.error} message={sp.message} />
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="muted"><tr className="border-b line"><th className="px-4 py-2">氏名</th><th className="px-4 py-2">役割</th><th className="px-4 py-2">できること</th><th className="px-4 py-2">担当範囲</th><th className="px-4 py-2">状態</th></tr></thead>
          <tbody className="divide-y line">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(data ?? []).map((s: any) => {
              const isAdmin = s.role === 'admin';
              const scopes = (s.staff_scopes ?? []).map((x: any) => (!x.course_id && !x.class_id ? 'すべて' : x.courses?.name ?? x.classes?.name)); // eslint-disable-line @typescript-eslint/no-explicit-any
              return (
                <tr key={s.id} className="hover:bg-black/5">
                  <td className="px-4 py-2"><Link href={`/admin/staff/${s.id}`} className="font-bold text-brand-700 hover:underline">{s.full_name}</Link></td>
                  <td className="px-4 py-2">{isAdmin ? '管理者' : 'スタッフ'}</td>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <td className="px-4 py-2">{isAdmin ? 'すべて' : (s.staff_permissions ?? []).map((p: any) => PERMISSIONS.find((x) => x.key === p.permission)?.label).join('、') || 'なし'}</td>
                  <td className="px-4 py-2">{isAdmin ? 'すべて' : scopes.join('、') || 'なし'}</td>
                  <td className="px-4 py-2">{STATUS_LABEL[s.status as AccountStatus]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
