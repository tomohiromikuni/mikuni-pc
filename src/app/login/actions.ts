'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  let message: string | null = null;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const code = (error as { code?: string }).code ?? '';
      if (code === 'invalid_credentials') message = 'メールアドレスまたはパスワードが違います';
      else if (code === 'user_banned') message = 'このアカウントは利用停止中です。事務局にお問い合わせください';
      else if (code === 'email_not_confirmed') message = 'メールアドレスの確認が済んでいません。事務局にお問い合わせください';
      else if (code === 'over_request_rate_limit' || error.status === 429) message = 'ログインの試行が多すぎます。しばらく待ってからお試しください';
      else message = `ログインできませんでした（${code || error.status || 'エラー'}：${error.message}）。時間をおいても続く場合は管理者に連絡してください`;
    }
  } catch (e) {
    message = `サーバーに接続できませんでした（${e instanceof Error ? e.message : '不明なエラー'}）。設定を確認してください`;
  }
  if (message) redirect('/login?error=' + encodeURIComponent(message));
  redirect('/');
}
