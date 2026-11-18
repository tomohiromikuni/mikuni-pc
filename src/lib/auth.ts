import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Permission, Profile } from '@/lib/types';

/** ログイン中の本人のプロフィール（なければ null） */
export const getMe = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  return (data as Profile) ?? null;
});

/** 有効なアカウントでなければ適切な画面へ移動させる */
export async function requireActive(): Promise<Profile> {
  const me = await getMe();
  if (!me) redirect('/login');
  if (me.status === 'suspended') redirect('/suspended');
  if (me.status !== 'active') redirect('/login');
  if (!me.terms_agreed_at) redirect('/terms');
  return me;
}

export async function requireTrainee(): Promise<Profile> {
  const me = await requireActive();
  if (me.role !== 'trainee') redirect('/admin');
  return me;
}

export async function requireStaff(): Promise<Profile> {
  const me = await requireActive();
  if (me.role === 'trainee') redirect('/home');
  // 2段階認証を必須にしている場合（Vercel の環境変数 REQUIRE_STAFF_MFA=true）
  if (process.env.REQUIRE_STAFF_MFA === 'true') {
    const supabase = await createClient();
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data?.currentLevel !== 'aal2') redirect('/mfa');
  }
  return me;
}

export async function requireAdmin(): Promise<Profile> {
  const me = await requireStaff();
  if (me.role !== 'admin') redirect('/admin?error=' + encodeURIComponent('管理者のみ操作できます'));
  return me;
}

/** 権限チェック（判定はデータベースの関数で行う＝画面と同じルール） */
export async function hasPerm(perm: Permission): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('has_perm', { perm });
  return data === true;
}

export async function requirePerm(perm: Permission): Promise<Profile> {
  const me = await requireStaff();
  if (!(await hasPerm(perm))) redirect('/admin?error=' + encodeURIComponent('この操作の権限がありません'));
  return me;
}
