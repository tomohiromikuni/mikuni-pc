import Link from 'next/link';
import { AuthShell } from '@/components/AuthShell';
import { LoginForm } from '@/components/LoginForm';
import { Notice, type Flash } from '@/components/ui';

export default async function LoginPage({ searchParams }: { searchParams: Promise<Flash> }) {
  const { error, message } = await searchParams;
  return (
    <AuthShell title="ログイン">
      <Notice error={error} message={message} />
      <LoginForm />
      <p className="muted text-center text-sm">
        パスワードを忘れたら、事務局に声をかけてください
        <br />
        <Link href="/forgot-password" className="text-xs underline">スタッフの方はこちら</Link>
      </p>
      <p className="text-center text-sm">
        はじめての方は <Link href="/join" className="font-bold text-brand-700 underline">こちらから登録</Link>
      </p>
    </AuthShell>
  );
}
