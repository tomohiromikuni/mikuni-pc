'use server';
import { loginIdToEmail } from '@/lib/phone';
import { createClient } from '@/lib/supabase/server';

export type LoginResult = { error?: string; ok?: boolean } | null;

/** ログイン（結果を返すだけ。画面の移動はブラウザ側で、ページ全体を読み込み直して行う） */
export async function login(_prev: LoginResult, formData: FormData): Promise<LoginResult> {
  // 携帯番号 または メールアドレス
  const email = loginIdToEmail(String(formData.get('email') ?? ''));
  const password = String(formData.get('password') ?? '');
  if (!email) return { error: '携帯番号（例：090-1234-5678）またはメールアドレスを入力してください' };
  let message: string | null = null;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const code = (error as { code?: string }).code ?? '';
      if (code === 'invalid_credentials') message = '携帯番号（メールアドレス）またはパスワードが違います';
      else if (code === 'user_banned') message = 'このアカウントは利用停止中です。事務局にお問い合わせください';
      else if (code === 'email_not_confirmed') message = 'メールアドレスの確認が済んでいません。事務局にお問い合わせください';
      else if (code === 'over_request_rate_limit' || error.status === 429) message = 'ログインの試行が多すぎます。しばらく待ってからお試しください';
      else message = `ログインできませんでした（${code || error.status || 'エラー'}：${error.message}）。時間をおいても続く場合は管理者に連絡してください`;
    }
  } catch (e) {
    message = `サーバーに接続できませんでした（${e instanceof Error ? e.message : '不明なエラー'}）。設定を確認してください`;
  }
  if (message) return { error: message };
  return { ok: true };
}
