function need(name: string, value: string | undefined): string {
  if (!value) throw new Error(`環境変数 ${name} が設定されていません（.env.example を参照）`);
  return value;
}

export const env = {
  supabaseUrl: () => need('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () => need('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  serviceRoleKey: () => need('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY),
  siteUrl: () => process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? '訓練生ポータル',
};
