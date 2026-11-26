import Link from 'next/link';
import { AuthShell } from '@/components/AuthShell';
import { JoinForm } from '@/components/JoinForm';
import { Notice } from '@/components/ui';
import { TERMS_TEXT } from '@/lib/terms';
import { listOpenClasses, selfRegister } from './actions';

export const dynamic = 'force-dynamic';

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const classes = await listOpenClasses();
  return (
    <AuthShell title="はじめての登録">
      <Notice error={error} />
      {classes.length === 0 ? (
        <p>現在、登録を受け付けている期はありません。事務局にお問い合わせください。</p>
      ) : (
        <JoinForm classes={classes} action={selfRegister} terms={TERMS_TEXT} />
      )}
      <p className="text-center text-sm">
        すでに登録した方は <Link href="/login" className="font-bold text-brand-700 underline">ログイン</Link>
      </p>
    </AuthShell>
  );
}
