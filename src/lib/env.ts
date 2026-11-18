function need(name: string, value: string | undefined): string {
  if (!value) throw new Error(`環境変数 ${name} が設定されていません（.env.example を参照）`);
  return value;
}

export const env = {
  supabaseUrl: () => need('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () => need('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  serviceRoleKey: () => need('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY),
  /**
   * 公開URL（招待URL・パスワード再設定メールに使う）
   * 1. NEXT_PUBLIC_SITE_URL が設定されていればそれ
   * 2. なければ Vercel が自動で用意する本番URL（例：mics-pc.vercel.app）
   * 3. どちらもなければ開発用の localhost
   */
  siteUrl: () => {
    const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '');
    if (explicit && !explicit.includes('localhost')) return explicit;
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return explicit || 'http://localhost:3000';
  },
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? '訓練生ポータル',
  vapidPublicKey: () => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
  vapidPrivateKey: () => need('VAPID_PRIVATE_KEY', process.env.VAPID_PRIVATE_KEY),
  vapidSubject: () => process.env.VAPID_SUBJECT || env.siteUrl(),
  cronSecret: () => need('CRON_SECRET', process.env.CRON_SECRET),
};
