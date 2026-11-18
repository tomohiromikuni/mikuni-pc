'use server';
import { getMe } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };

/** この端末を通知の宛先として登録（同じ端末で別の人が登録していたら置き換える） */
export async function savePushSubscription(sub: Sub, userAgent: string): Promise<{ error?: string }> {
  const me = await getMe();
  if (!me || me.status !== 'active') return { error: 'ログインしてください' };
  if (!sub?.endpoint?.startsWith('https://') || !sub.keys?.p256dh || !sub.keys?.auth) return { error: '通知の登録情報が正しくありません' };
  await createAdminClient().from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  const supabase = await createClient();
  const { error } = await supabase.from('push_subscriptions').insert({
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    user_agent: userAgent.slice(0, 300),
  });
  return error ? { error: error.message } : {};
}

export async function deletePushSubscription(endpoint: string) {
  const supabase = await createClient();
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
}
