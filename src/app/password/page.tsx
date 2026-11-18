import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/AuthShell';
import { Button, Field, Notice, type Flash } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

async function changePassword(formData: FormData) {
  'use server';
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  const back = (e: string) => redirect('/password?error=' + encodeURIComponent(e));
  if (password.length < 8) back('パスワードは8文字以上にしてください');
  if (password !== confirm) back('確認用のパスワードが一致しません');
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) back('変更できませんでした：' + error.message);
  redirect('/password?message=' + encodeURIComponent('パスワードを変更しました'));
}

export default async function PasswordPage({ searchParams }: { searchParams: Promise<Flash> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const { error, message } = await searchParams;
  return (
    <AuthShell title="パスワードの変更">
      <Notice error={error} message={message} />
      <form action={changePassword} className="space-y-4">
        <Field label="新しいパスワード" hint="8文字以上">
          <input name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        <Field label="新しいパスワード（確認）">
          <input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        <Button type="submit" className="w-full">変更する</Button>
      </form>
      <a href="/" className="block text-center text-sm font-bold text-brand-700">‹ 戻る</a>
    </AuthShell>
  );
}
