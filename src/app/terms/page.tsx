import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/AuthShell';
import { Button } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { TERMS_TEXT } from '@/lib/terms';

async function agree() {
  'use server';
  const supabase = await createClient();
  await supabase.rpc('agree_terms');
  redirect('/');
}

export default async function TermsPage() {
  const me = await getMe();
  if (!me) redirect('/login');
  if (me.status === 'suspended') redirect('/suspended');
  if (me.terms_agreed_at) redirect('/');
  return (
    <AuthShell title="利用規約と個人情報の取り扱い">
      <div className="max-h-[50dvh] overflow-y-auto whitespace-pre-wrap rounded-xl border line p-3 text-sm">{TERMS_TEXT}</div>
      <form action={agree}>
        <Button type="submit" className="w-full">同意して始める</Button>
      </form>
    </AuthShell>
  );
}
