import Link from 'next/link';
import { notFound } from 'next/navigation';
import { InvitePanel } from '@/components/InvitePanel';
import { Button, Card, Field, Notice, PageTitle, type Flash } from '@/components/ui';
import { requireAdmin } from '@/lib/auth';
import { getClassOptions } from '@/lib/classes';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { STATUS_LABEL, type AccountStatus } from '@/lib/types';
import { issueInvite } from '../../trainees/actions';
import { resetStaffMfa, setAlsoTrainee, setStaffSuspended, updateStaff } from '../actions';

export default async function StaffDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Flash> }) {
  const me = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: s } = await supabase
    .from('profiles')
    .select('id, full_name, role, status, also_trainee, enrollments(class_id, ended_on)')
    .eq('id', id)
    .neq('role', 'trainee')
    .maybeSingle();
  if (!s) notFound();
  const [classes, { data: u }] = await Promise.all([getClassOptions(), createAdminClient().auth.admin.getUserById(id)]);
  const status = s.status as AccountStatus;

  return (
    <div className="space-y-6">
      <Link href="/admin/staff" className="text-sm font-bold text-brand-700">‹ スタッフ</Link>
      <PageTitle>{s.full_name}<span className="ml-3 rounded-md bg-black/5 px-2 py-0.5 align-middle text-sm">{STATUS_LABEL[status]}</span></PageTitle>
      <Notice error={sp.error} message={sp.message} />
      <Card>
        <form action={updateStaff.bind(null, id)} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="名前"><input name="full_name" defaultValue={s.full_name} required /></Field>
            <Field label="メールアドレス（ログインID）"><input value={u.user?.email ?? ''} readOnly className="opacity-70" /></Field>
          </div>
          <fieldset>
            <legend className="mb-1 text-sm font-semibold">役割</legend>
            <div className="flex flex-wrap gap-5">
              <label className="flex items-center gap-2 font-normal"><input type="radio" name="role" value="staff" defaultChecked={s.role !== 'admin'} /> メンバー（削除・スタッフの管理以外すべて）</label>
              <label className="flex items-center gap-2 font-normal"><input type="radio" name="role" value="admin" defaultChecked={s.role === 'admin'} /> 管理者（すべて）</label>
            </div>
          </fieldset>
          <Button type="submit">保存する</Button>
        </form>
      </Card>
      <Card>
        <h2 className="mb-2 font-bold">訓練生としても参加</h2>
        <p className="mb-3 text-sm">オンにすると、1つのログインで「管理画面」と「訓練生の画面」を切り替えて使えます。選んだ期あてのお知らせ・出欠が届き、事務局チャットも使えます。</p>
        <form action={setAlsoTrainee.bind(null, id, `/admin/staff/${id}`)} className="space-y-3">
          <label className="flex items-center gap-2 font-normal">
            <input type="checkbox" name="also_trainee" defaultChecked={s.also_trainee} /> 訓練生としても参加する
          </label>
          <Field label="所属する期">
            <select name="class_id" defaultValue={(s.enrollments ?? []).find((e) => !e.ended_on)?.class_id ?? ''}>
              <option value="">未所属</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
          <Button type="submit" variant="secondary">保存</Button>
        </form>
      </Card>

      {status !== 'suspended' && (
        <Card>
          <h2 className="mb-2 font-bold">招待</h2>
          <InvitePanel issue={issueInvite.bind(null, id)} name={s.full_name} alreadyActive={status === 'active'} />
        </Card>
      )}
      {id !== me.id && (
        <Card>
          <form action={setStaffSuspended.bind(null, id, status !== 'suspended')}>
            <Button type="submit" variant={status === 'suspended' ? 'primary' : 'danger'}>{status === 'suspended' ? '利用を再開する' : '利用を停止する'}</Button>
          </form>
          <p className="muted mt-2 text-xs">退職・異動のときは停止してください。過去のメッセージ等は残ります。</p>
          <form action={resetStaffMfa.bind(null, id)} className="mt-4">
            <Button type="submit" variant="secondary">2段階認証をリセット（スマホの機種変更・紛失時）</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
