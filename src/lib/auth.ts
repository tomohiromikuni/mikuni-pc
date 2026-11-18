import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Permission, Profile } from '@/lib/types';

type MeWithPerms = Profile & { perms: Permission[] };

/** ログイン中の本人のプロフィールと権限（1回の問い合わせで取得し、同じ画面表示の中では使い回す） */
const loadMe = cache(async (): Promise<MeWithPerms | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const uid = auth?.claims?.sub;
  if (!uid) return null;
  const { data } = await supabase.from('profiles').select('*, staff_permissions(permission)').eq('id', uid).maybeSingle();
  if (!data) return null;
  const { staff_permissions, ...profile } = data as Profile & { staff_permissions?: { permission: Permission }[] };
  return { ...profile, perms: (staff_permissions ?? []).map((p) => p.permission) };
});

/** ログイン中の本人のプロフィール（なければ null） */
export const getMe = cache(async (): Promise<Profile | null> => loadMe());

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

/**
 * 権限チェック（画面の表示切り替え用）。データベースの has_perm と同じ判定。
 * ※実際に見られるデータは、常にデータベース側の権限ルールで制限される
 */
export async function hasPerm(perm: Permission): Promise<boolean> {
  const me = await loadMe();
  if (!me || me.status !== 'active') return false;
  if (me.role === 'admin') return true;
  return me.role === 'staff' && me.perms.includes(perm);
}

export async function requirePerm(perm: Permission): Promise<Profile> {
  const me = await requireStaff();
  if (!(await hasPerm(perm))) redirect('/admin?error=' + encodeURIComponent('この操作の権限がありません'));
  return me;
}
