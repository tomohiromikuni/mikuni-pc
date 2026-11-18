import { AuthShell } from '@/components/AuthShell';
import { Button, Field, LinkButton, Notice, type Flash } from '@/components/ui';
import { findInvitation } from '@/lib/invitation-lookup';
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
        ログインに使うパスワードを決めてください。
      </p>
      <Notice error={error} />
      <form action={acceptInvitation.bind(null, token)} className="space-y-4">
        <Field label="メールアドレス（ログインID）">
          <input value={found.email} readOnly className="opacity-70" />
        </Field>
        <Field label="パスワード" hint="8文字以上。ほかのサービスと同じものは避けてください">
          <input name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        <Field label="パスワード（確認のためもう一度）">
          <input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        <Button type="submit" className="w-full">登録する</Button>
      </form>
    </AuthShell>
  );
}
