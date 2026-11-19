'use server';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { findInvitation } from '@/lib/invitation-lookup';

export async function acceptInvitation(token: string, formData: FormData): Promise<{ ok: true }> {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  const back = (msg: string) => redirect(`/invite/${token}?error=${encodeURIComponent(msg)}`);

  if (password.length < 8) back('パスワードは8文字以上にしてください');
  if (password !== confirm) back('確認用のパスワードが一致しません');

  const found = await findInvitation(token);
  if (!found) redirect('/login?error=' + encodeURIComponent('招待URLが無効か、有効期限が切れています。事務局にお問い合わせください'));

  const admin = createAdminClient();
  // 先に「使用済み」にして、同じURLが二重に使われないようにする
  const { data: claimed } = await admin
    .from('invitations')
    .update({ used_at: new Date().toISOString() })
    .eq('id', found.invitationId)
    .is('used_at', null)
    .select('id');
  if (!claimed?.length) back('この招待URLはすでに使われています');

  const { error } = await admin.auth.admin.updateUserById(found.profile.id, { password, email_confirm: true });
  if (error) back('パスワードを設定できませんでした：' + error.message);
  await admin.from('profiles').update({ status: 'active' }).eq('id', found.profile.id).eq('status', 'invited');

  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email: found.email, password });
  return { ok: true };
}
