'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { parseTargetValues } from '@/lib/targets-parse';

const schema = z.object({
  full_name: z.string().trim().min(1, '氏名を入力してください').max(100),
  email: z.string().trim().toLowerCase().pipe(z.email('メールアドレスの形式が正しくありません')),
  role: z.enum(['admin', 'staff']),
});

function readPerms(f: FormData) {
  const valid = new Set(PERMISSIONS.map((p) => p.key));
  return f.getAll('perm').map(String).filter((p) => valid.has(p as never));
}

function readScopes(f: FormData, staffId: string) {
  return parseTargetValues(f.getAll('scope').map(String)).map((t) => ({ staff_id: staffId, course_id: t.course_id, class_id: t.class_id }));
}

async function replacePermsAndScopes(staffId: string, f: FormData) {
  const supabase = await createClient();
  await supabase.from('staff_permissions').delete().eq('staff_id', staffId);
  await supabase.from('staff_scopes').delete().eq('staff_id', staffId);
  const perms = readPerms(f);
  if (perms.length) await supabase.from('staff_permissions').insert(perms.map((permission) => ({ staff_id: staffId, permission })));
  const scopes = readScopes(f, staffId);
  if (scopes.length) await supabase.from('staff_scopes').insert(scopes);
}

export async function createStaff(f: FormData) {
  const me = await requireAdmin();
  const v = schema.safeParse({ full_name: f.get('full_name'), email: f.get('email'), role: f.get('role') });
  if (!v.success) redirect('/admin/staff/new?error=' + encodeURIComponent(v.error.issues[0].message));
  const admin = createAdminClient();
  const { data: created, error } = await admin.auth.admin.createUser({ email: v.data.email, email_confirm: true });
  if (error || !created.user)
    redirect('/admin/staff/new?error=' + encodeURIComponent(/already|registered|exists/i.test(error?.message ?? '') ? 'このメールアドレスはすでに登録されています' : '登録できませんでした：' + error?.message));
  const id = created.user.id;
  const supabase = await createClient();
  const { error: pe } = await supabase.from('profiles').insert({ id, org_id: me.org_id, role: v.data.role, status: 'invited', full_name: v.data.full_name, full_name_kana: '' });
  if (pe) {
    await admin.auth.admin.deleteUser(id);
    redirect('/admin/staff/new?error=' + encodeURIComponent('登録できませんでした：' + pe.message));
  }
  if (v.data.role === 'staff') await replacePermsAndScopes(id, f);
  revalidatePath('/admin/staff');
  redirect(`/admin/staff/${id}?message=` + encodeURIComponent('登録しました。招待URLを発行して本人に渡してください'));
}

export async function updateStaff(id: string, f: FormData) {
  await requireAdmin();
  const back = (k: string, m: string) => redirect(`/admin/staff/${id}?${k}=${encodeURIComponent(m)}`);
  const name = String(f.get('full_name') ?? '').trim();
  const role = String(f.get('role')) === 'admin' ? 'admin' : 'staff';
  if (!name) back('error', '氏名を入力してください');
  const supabase = await createClient();
  const { error } = await supabase.from('profiles').update({ full_name: name, role }).eq('id', id).neq('role', 'trainee');
  if (error) back('error', error.message);
  await replacePermsAndScopes(id, f);
  revalidatePath(`/admin/staff/${id}`);
  back('message', '保存しました');
}

export async function setStaffSuspended(id: string, suspended: boolean) {
  const me = await requireAdmin();
  if (id === me.id) redirect(`/admin/staff/${id}?error=` + encodeURIComponent('自分自身は停止できません'));
  const supabase = await createClient();
  const { error } = await supabase.from('profiles').update({ status: suspended ? 'suspended' : 'active' }).eq('id', id).neq('role', 'trainee');
  if (error) redirect(`/admin/staff/${id}?error=` + encodeURIComponent(error.message));
  await createAdminClient().auth.admin.updateUserById(id, { ban_duration: suspended ? '876000h' : 'none' });
  revalidatePath(`/admin/staff/${id}`);
  redirect(`/admin/staff/${id}?message=` + encodeURIComponent(suspended ? '利用を停止しました' : '利用を再開しました'));
}

export async function resetStaffMfa(id: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.mfa.listFactors({ userId: id });
  for (const f of data?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: id });
  const supabase = await createClient();
  await supabase.rpc('log_action', { p_action: 'staff.mfa_reset', p_target_type: 'profile', p_target_id: id });
  redirect(`/admin/staff/${id}?message=` + encodeURIComponent('2段階認証をリセットしました。次回ログイン時に再登録が必要です'));
}

const todayJst = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());

/** 所属クラスを変える（今の所属を終了して新しい所属を追加。履歴が残る） */
async function setEnrollment(profileId: string, orgId: string, classId: string) {
  const supabase = await createClient();
  const { data: cur } = await supabase.from('enrollments').select('id, class_id').eq('trainee_id', profileId).is('ended_on', null).maybeSingle();
  if ((cur?.class_id ?? '') === classId) return;
  if (cur) await supabase.from('enrollments').update({ ended_on: todayJst() }).eq('id', cur.id);
  if (classId) await supabase.from('enrollments').insert({ org_id: orgId, trainee_id: profileId, class_id: classId, started_on: todayJst() });
}

/** 運営メンバーの「訓練生としても参加」とその所属クラス */
export async function setAlsoTrainee(id: string, back: string, f: FormData) {
  const me = await requireAdmin();
  const on = f.get('also_trainee') === 'on';
  const classId = String(f.get('class_id') ?? '');
  const supabase = await createClient();
  const { error } = await supabase.from('profiles').update({ also_trainee: on }).eq('id', id).neq('role', 'trainee');
  if (error) redirect(`${back}?error=` + encodeURIComponent(error.message));
  if (on) await setEnrollment(id, me.org_id, classId);
  revalidatePath(back);
  if (on && back === '/admin/trainee-mode') redirect('/home');
  redirect(
    `${back}?message=` +
      encodeURIComponent(on ? '訓練生としても参加するようにしました。所属する期あてのお知らせ・出欠が届きます' : '訓練生としての参加をやめました'),
  );
}

/** 訓練生として登録済みの人を、運営メンバー（管理者・スタッフ）にする。訓練生としての参加・ログインはそのまま */
export async function promoteTrainee(id: string, f: FormData) {
  await requireAdmin();
  const role = String(f.get('role')) === 'admin' ? 'admin' : 'staff';
  const supabase = await createClient();
  const { error } = await supabase.from('profiles').update({ role, also_trainee: true }).eq('id', id).eq('role', 'trainee');
  if (error) redirect(`/admin/trainees/${id}?error=` + encodeURIComponent(error.message));
  revalidatePath('/admin/staff');
  redirect(
    `/admin/staff/${id}?message=` +
      encodeURIComponent(`${role === 'admin' ? '管理者' : 'スタッフ'}にしました。今のログイン（携帯番号）のまま、管理画面と訓練生モードを切り替えて使えます`),
  );
}
