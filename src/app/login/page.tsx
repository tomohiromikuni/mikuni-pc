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
        <Field label="携帯番号" hint="スタッフ・管理者はメールアドレスでもログインできます">
          <input name="email" type="text" autoComplete="username" inputMode="text" placeholder="090-1234-5678" required />
        </Field>
        <Field label="パスワード">
          <input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Button type="submit" className="w-full">ログイン</Button>
      </form>
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="text-brand-700 underline">パスワードを忘れた方</Link>
      </p>
      <p className="text-center text-sm">
        はじめての方は <Link href="/join" className="font-bold text-brand-700 underline">こちらから登録</Link>
      </p>
    </AuthShell>
  );
}
