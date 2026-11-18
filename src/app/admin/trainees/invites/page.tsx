import Link from 'next/link';
import { BulkInvite } from '@/components/BulkInvite';
import { Card, PageTitle } from '@/components/ui';
import { requirePerm } from '@/lib/auth';
import { getClassOptions } from '@/lib/classes';
import { env } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

export default async function BulkInvitePage({ searchParams }: { searchParams: Promise<{ class?: string; all?: string }> }) {
  await requirePerm('manage_trainees');
  const sp = await searchParams;
  const supabase = await createClient();
  const [classes, { data }] = await Promise.all([
    getClassOptions(),
    supabase
      .from('profiles')
      .select('id, full_name, full_name_kana, status, enrollments(class_id, ended_on, classes(name, courses(name)))')
      .eq('role', 'trainee')
      .neq('status', 'suspended')
      .order('full_name_kana'),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const people = (data ?? []).map((t: any) => {
    const cur = (t.enrollments ?? []).find((e: { ended_on: string | null }) => !e.ended_on);
    return { id: t.id, name: t.full_name, status: t.status, classId: cur?.class_id ?? '', label: cur ? `${cur.classes.courses.name} / ${cur.classes.name}` : '未所属' };
  }).filter((p) => (!sp.class || p.classId === sp.class) && (sp.all === '1' || p.status === 'invited'));

  return (
    <div className="space-y-4">
      <Link href="/admin/trainees" className="text-sm font-bold text-brand-700 print:hidden">‹ 訓練生一覧</Link>
      <div className="print:hidden"><PageTitle>招待QRをまとめて発行</PageTitle></div>
      <Card className="print:hidden">
        <form className="flex flex-wrap items-end gap-3">
          <select name="class" defaultValue={sp.class ?? ''} aria-label="クラス" className="max-w-72">
            <option value="">すべてのクラス</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <label className="flex items-center gap-2 font-normal"><input type="checkbox" name="all" value="1" defaultChecked={sp.all === '1'} /> 利用中の人も表示（再発行）</label>
          <button className="min-h-11 rounded-xl bg-brand-600 px-5 font-bold text-white">表示</button>
        </form>
      </Card>
      <BulkInvite key={`${sp.class}-${sp.all}`} people={people} appName={env.appName} />
    </div>
  );
}
