'use server';
import QRCode from 'qrcode';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin, requirePerm } from '@/lib/auth';
import { env } from '@/lib/env';
import { INVITE_DAYS, newInviteToken } from '@/lib/invite';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const traineeSchema = z.object({
  full_name: z.string().trim().min(1, '氏名を入力してください').max(100),
  full_name_kana: z.string().trim().max(100),
  email: z.string().trim().toLowerCase().pipe(z.email('メールアドレスの形式が正しくありません')),
  phone: z.string().trim().max(20),
  class_id: z.string().trim(),
  enrolled_on: z.string().trim(),
  expected_completion_on: z.string().trim(),
});

function parse(f: FormData, withContact = true) {
  const schema = withContact ? traineeSchema : traineeSchema.omit({ email: true, phone: true });
  const r = schema.safeParse(Object.fromEntries(['full_name', 'full_name_kana', 'email', 'phone', 'class_id', 'enrolled_on', 'expected_completion_on'].map((k) => [k, String(f.get(k) ?? '')])));
  if (!r.success) return { error: r.error.issues[0].message } as const;
  return { data: r.data as z.infer<typeof traineeSchema> } as const;
}

const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());

export async function createTrainee(f: FormData) {
  const me = await requirePerm('manage_trainees');
  const p = parse(f);
  if ('error' in p) redirect('/admin/trainees/new?error=' + encodeURIComponent(p.error!));
  const v = p.data!;

  const admin = createAdminClient();
  const { data: created, error: authErr } = await admin.auth.admin.createUser({ email: v.email, email_confirm: true });
  if (authErr || !created.user) {
    const msg = /already|registered|exists/i.test(authErr?.message ?? '')
      ? 'このメールアドレスはすでに登録されています'
      : '登録できませんでした：' + authErr?.message;
    redirect('/admin/trainees/new?error=' + encodeURIComponent(msg));
  }
  const id = created.user.id;

  // ここからは本人の権限（RLS）で書き込む。失敗したらログインアカウントを消して元に戻す
  const supabase = await createClient();
  const steps = [
    () => supabase.from('profiles').insert({ id, org_id: me.org_id, role: 'trainee', status: 'invited', full_name: v.full_name, full_name_kana: v.full_name_kana }),
    () => (v.class_id ? supabase.from('enrollments').insert({ org_id: me.org_id, trainee_id: id, class_id: v.class_id, started_on: v.enrolled_on || today() }) : Promise.resolve({ error: null })),
    () => supabase.from('trainee_details').insert({ profile_id: id, email: v.email, phone: v.phone, enrolled_on: v.enrolled_on || null, expected_completion_on: v.expected_completion_on || null }),
  ];
  for (const step of steps) {
    const { error } = await step();
    if (error) {
      await admin.auth.admin.deleteUser(id);
      redirect('/admin/trainees/new?error=' + encodeURIComponent('登録できませんでした：' + error.message));
    }
  }
  revalidatePath('/admin/trainees');
  redirect(`/admin/trainees/${id}?message=` + encodeURIComponent('登録しました。次に招待URLを発行してください'));
}

export async function updateTrainee(id: string, f: FormData) {
  await requirePerm('manage_trainees');
  const back = (k: 'error' | 'message', m: string) => redirect(`/admin/trainees/${id}?${k}=${encodeURIComponent(m)}`);
  // 連絡先の閲覧権限がない人のフォームには、メール・電話の欄がない
  const withContact = f.has('email');
  const p = parse(f, withContact);
  if ('error' in p) back('error', p.error!);
  const v = p.data!;
  const supabase = await createClient();

  const { error: e1 } = await supabase.from('profiles').update({ full_name: v.full_name, full_name_kana: v.full_name_kana }).eq('id', id);
  if (e1) back('error', '保存できませんでした：' + e1.message);

  const { data: current } = await supabase.from('trainee_details').select('email').eq('profile_id', id).maybeSingle();
  if (withContact && current && current.email !== v.email) {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(id, { email: v.email, email_confirm: true });
    if (error) back('error', 'メールアドレスを変更できませんでした：' + error.message);
  }
  const { error: e2 } = await supabase.from('trainee_details').update({
    ...(withContact ? { email: v.email, phone: v.phone } : {}),
    enrolled_on: v.enrolled_on || null,
    expected_completion_on: v.expected_completion_on || null,
    updated_at: new Date().toISOString(),
  }).eq('profile_id', id);
  if (e2) back('error', '保存できませんでした：' + e2.message);

  // 所属の変更：今の所属を終了し、新しい所属を追加（履歴が残る）
  const { data: enr } = await supabase.from('enrollments').select('id, class_id').eq('trainee_id', id).is('ended_on', null).maybeSingle();
  if ((enr?.class_id ?? '') !== v.class_id) {
    if (enr) await supabase.from('enrollments').update({ ended_on: today() }).eq('id', enr.id);
    if (v.class_id) {
      const { data: prof } = await supabase.from('profiles').select('org_id').eq('id', id).single();
      const { error } = await supabase.from('enrollments').insert({ org_id: prof!.org_id, trainee_id: id, class_id: v.class_id, started_on: today() });
      if (error) back('error', '所属を変更できませんでした：' + error.message);
    }
  }
  revalidatePath(`/admin/trainees/${id}`);
  back('message', '保存しました');
}

export async function setTraineeSuspended(id: string, suspended: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { data: p } = await supabase.from('profiles').select('status').eq('id', id).single();
  const next = suspended ? 'suspended' : 'active';
  const { error } = await supabase.from('profiles').update({ status: next }).eq('id', id);
  if (error) redirect(`/admin/trainees/${id}?error=` + encodeURIComponent(error.message));
  // ログインそのものも止める（ログイン中の端末も次の通信で切れる）
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(id, { ban_duration: suspended ? '876000h' : 'none' });
  if (!suspended && p?.status === 'suspended') {
    // 一度もパスワードを設定していない人は「招待中」に戻す
    const { data: u } = await admin.auth.admin.getUserById(id);
    if (!u.user?.last_sign_in_at) await supabase.from('profiles').update({ status: 'invited' }).eq('id', id);
  }
  revalidatePath(`/admin/trainees/${id}`);
  redirect(`/admin/trainees/${id}?message=` + encodeURIComponent(suspended ? '利用を停止しました' : '利用を再開しました'));
}

export type InviteResult = { url: string; qr: string; expiresAt: string } | { error: string } | null;

/** 招待URLを発行（以前の未使用URLは無効になる）。URLはこの画面でのみ表示し、保存しない */
export async function issueInvite(traineeId: string): Promise<InviteResult> {
  const me = await requirePerm('manage_trainees');
  const supabase = await createClient();
  // 権限ルールで見えない＝担当外の訓練生には発行させない
  const { data: target } = await supabase.from('profiles').select('id, status, role').eq('id', traineeId).maybeSingle();
  if (!target || target.role !== 'trainee') return { error: 'この訓練生に招待を発行する権限がありません' };
  if (target.status === 'suspended') return { error: '利用停止中のため発行できません。先に利用を再開してください' };

  const admin = createAdminClient();
  const now = new Date();
  await admin.from('invitations').update({ revoked_at: now.toISOString() }).eq('profile_id', traineeId).is('used_at', null).is('revoked_at', null);
  const { token, hash } = newInviteToken();
  const expiresAt = new Date(now.getTime() + INVITE_DAYS * 86400000).toISOString();
  const { error } = await admin.from('invitations').insert({ org_id: me.org_id, profile_id: traineeId, token_hash: hash, expires_at: expiresAt, created_by: me.id });
  if (error) return { error: '発行できませんでした：' + error.message };

  const url = `${env.siteUrl()}/invite/${token}`;
  const qr = await QRCode.toDataURL(url, { width: 320, margin: 1 });
  return { url, qr, expiresAt };
}
