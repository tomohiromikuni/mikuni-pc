import 'server-only';
import { hashToken } from '@/lib/invite';
import { createAdminClient } from '@/lib/supabase/admin';

/** 招待コードが有効か調べ、対象者の情報を返す（ログイン前なので管理用クライアントで照合） */
export async function findInvitation(token: string) {
  const admin = createAdminClient();
  const { data: inv } = await admin
    .from('invitations')
    .select('id, profile_id, expires_at, used_at, revoked_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle();
  if (!inv || inv.used_at || inv.revoked_at || new Date(inv.expires_at) < new Date()) return null;
  const { data: profile } = await admin
    .from('profiles')
    .select('id, full_name, status, role')
    .eq('id', inv.profile_id)
    .single();
  if (!profile || profile.status === 'suspended') return null;
  const { data: user } = await admin.auth.admin.getUserById(inv.profile_id);
  return { invitationId: inv.id as string, profile, email: user.user?.email ?? '' };
}
