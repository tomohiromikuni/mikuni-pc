import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/AuthShell';
import { MfaFlow } from '@/components/MfaFlow';
import { getMe } from '@/lib/auth';

export default async function MfaPage() {
  const me = await getMe();
  if (!me) redirect('/login');
  if (me.role === 'trainee') redirect('/home');
  return (
    <AuthShell title="2段階認証">
      <MfaFlow />
      <form action="/auth/signout" method="post" className="text-center">
        <button className="muted text-sm underline">ログアウト</button>
      </form>
    </AuthShell>
  );
}
