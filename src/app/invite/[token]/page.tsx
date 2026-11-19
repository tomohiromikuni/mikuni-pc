import { AuthShell } from '@/components/AuthShell';
import { InviteForm } from '@/components/InviteForm';
import { LinkButton, Notice, type Flash } from '@/components/ui';
import { findInvitation } from '@/lib/invitation-lookup';
import { formatPhone, isPhoneLoginEmail } from '@/lib/phone';
import { acceptInvitation } from './actions';

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Flash>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const found = await findInvitation(token);

  if (!found) {
    return (
      <AuthShell title="招待URLが使えません">
        <p>このURLは有効期限が切れているか、すでに使われています。</p>
        <p className="muted text-sm">お手数ですが、事務局に新しい招待URLの発行を依頼してください。</p>
        <LinkButton href="/login" variant="secondary" className="w-full">ログイン画面へ</LinkButton>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="はじめての登録">
      <p>
        <strong className="text-lg">{found.profile.full_name}</strong> さん、ようこそ。
        <br />
        ログインに使うパスワードを決めてください（以前のパスワードは使えなくなります）。
      </p>
      <Notice error={error} />
      <InviteForm
        action={acceptInvitation.bind(null, token)}
        loginLabel={isPhoneLoginEmail(found.email) ? '携帯番号（ログインID）' : 'メールアドレス（ログインID）'}
        loginValue={isPhoneLoginEmail(found.email) ? formatPhone(found.email.slice(1, found.email.indexOf('@'))) : found.email}
      />
    </AuthShell>
  );
}
