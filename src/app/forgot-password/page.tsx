import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/AuthShell';
import { Button, Field, Notice, type Flash } from '@/components/ui';
import { env } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

async function sendReset(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '').trim();
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${env.siteUrl()}/auth/callback?next=/password`,
  });
  // 登録の有無が分からないよう、結果に関わらず同じ表示にする
  redirect('/forgot-password?message=' + encodeURIComponent('登録されているアドレスであれば、再設定用のメールを送りました'));
}

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<Flash> }) {
  const { error, message } = await searchParams;
  return (
    <AuthShell title="パスワードの再設定">
      <Notice error={error} message={message} />
      <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-700">
        <strong>携帯番号でログインしている訓練生の方へ：</strong>事務局にパスワードの再設定を依頼してください。その場で再設定用のQRコードをお渡しします。
      </p>
      <p className="text-sm">メールアドレスでログインしている方（スタッフ等）は、アドレスを入力してください。再設定用のリンクをお送りします。</p>
      <form action={sendReset} className="space-y-4">
        <Field label="メールアドレス">
          <input name="email" type="email" autoComplete="email" required />
        </Field>
        <Button type="submit" className="w-full">メールを送る</Button>
      </form>
      <p className="muted text-xs">メールが届かない場合は、事務局に招待URLの再発行を依頼してください。</p>
    </AuthShell>
  );
}
