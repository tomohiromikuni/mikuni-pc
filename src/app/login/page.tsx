import Link from 'next/link';
import { AuthShell } from '@/components/AuthShell';
import { Button, Field, Notice, type Flash } from '@/components/ui';
import { login } from './actions';

export default async function LoginPage({ searchParams }: { searchParams: Promise<Flash> }) {
  const { error, message } = await searchParams;
  return (
    <AuthShell title="ログイン">
      <Notice error={error} message={message} />
      <form action={login} className="space-y-4">
        <Field label="メールアドレス">
          <input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="パスワード">
          <input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Button type="submit" className="w-full">ログイン</Button>
      </form>
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="text-brand-700 underline">パスワードを忘れた方</Link>
      </p>
      <p className="muted text-center text-xs">このアプリは招待された方だけが利用できます。</p>
    </AuthShell>
  );
}
