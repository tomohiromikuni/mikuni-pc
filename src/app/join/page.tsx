import Link from 'next/link';
import { AuthShell } from '@/components/AuthShell';
import { JoinForm } from '@/components/JoinForm';
import { Notice } from '@/components/ui';
import { TERMS_TEXT } from '@/lib/terms';
import { selfRegister } from './actions';

export const dynamic = 'force-dynamic';

/** 共通QRの登録画面（受講番号＋お名前＋自分で決めるパスワード） */
export default async function JoinPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <AuthShell title="はじめての登録">
      <Notice error={error} />
      <JoinForm action={selfRegister} terms={TERMS_TEXT} />
      <p className="text-center text-sm">
        すでに登録した方は <Link href="/login" className="font-bold text-brand-700 underline">ログイン</Link>
      </p>
    </AuthShell>
  );
}
