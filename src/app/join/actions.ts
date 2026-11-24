'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { findByStudentNo, loginEmailOf } from '@/lib/student-login';
import { parseNo, sameName } from '@/lib/student-number';

const schema = z.object({
  full_name: z.string().trim().min(1, 'お名前を入力してください').max(100),
  password: z.string().min(8, 'パスワードは8文字以上にしてください').max(72),
  confirm: z.string(),
  agree: z.literal('on', { error: '利用規約に同意してください' }),
});

/**
 * 共通QRからの登録（デザイン案A）：
 * 受講番号（○期生 ○番）とお名前が事務局の名簿と合えば、自分で決めたパスワードで使い始める。
 * 名簿にない人は登録できない（事務局が先に名簿へ登録する運用）
 */
export async function selfRegister(formData: FormData): Promise<{ ok: true }> {
  const back = (msg: string): never => redirect('/join?error=' + encodeURIComponent(msg));
  // ロボット対策（人には見えない欄に入力があれば無視）
  if (String(formData.get('website') ?? '')) back('登録できませんでした');

  const cohort = parseNo(formData.get('cohort'), 9999);
  const seat = parseNo(formData.get('seat'));
  if (!cohort || !seat) back('受講番号（何期生の何番か）を数字で入力してください');
  const parsed = schema.safeParse(Object.fromEntries(['full_name', 'password', 'confirm', 'agree'].map((k) => [k, formData.get(k) ?? ''])));
  if (!parsed.success) back(parsed.error.issues[0].message);
  const v = parsed.data!;
  if (v.password !== v.confirm) back('確認用のパスワードが一致しません');

  // 名簿を探す（見つからない・名前が違うときは、どちらが違うかを言わない）
  const notFound = '受講番号かお名前が名簿と一致しません。カードの番号と、名簿のお名前を確かめてください（分からなければ事務局へ）';
  const hit = await findByStudentNo(cohort!, seat!);
  if (!hit) back(notFound);
  if (hit!.courseArchived || !hit!.openForSignup) back('この期は今、登録を受け付けていません。事務局にお問い合わせください');

  const db = createAdminClient();
  const { data: prof } = await db.from('profiles').select('id, org_id, status, full_name').eq('id', hit!.traineeId).single();
  if (!prof || !sameName(prof.full_name, v.full_name)) back(notFound);
  if (prof!.status === 'active') back('この受講番号はすでに登録が済んでいます。ログイン画面からログインしてください（パスワードを忘れた場合は事務局へ）');
  if (prof!.status !== 'invited') back('この受講番号は今使えません。事務局にお問い合わせください');

  const { error: pwErr } = await db.auth.admin.updateUserById(prof!.id, { password: v.password, email_confirm: true });
  if (pwErr) back('登録できませんでした（' + pwErr.message + '）。事務局にこの画面を見せてください');
  await db.from('profiles').update({ status: 'active', terms_agreed_at: new Date().toISOString() }).eq('id', prof!.id);
  await db.from('invitations').update({ revoked_at: new Date().toISOString() }).eq('profile_id', prof!.id).is('used_at', null).is('revoked_at', null);
  await db.from('audit_logs').insert({ org_id: prof!.org_id, actor_id: prof!.id, action: 'trainee.self_register', target_type: 'profile', target_id: prof!.id, detail: { name: prof!.full_name, student_no: `${cohort}-${seat}` } });

  const email = await loginEmailOf(prof!.id);
  if (email) {
    const supabase = await createClient();
    await supabase.auth.signInWithPassword({ email, password: v.password });
  }
  return { ok: true };
}
