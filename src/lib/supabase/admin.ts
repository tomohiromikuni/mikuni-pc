import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/**
 * 管理用クライアント（権限ルールを無視できる）。
 * ログインアカウントの作成・パスワード設定・利用停止・招待コードの照合だけに使う。
 * 呼び出す前に必ず、呼び出した人の権限をチェックすること。
 */
export function createAdminClient() {
  return createClient(env.supabaseUrl(), env.serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
