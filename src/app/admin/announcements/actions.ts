'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin, requirePerm } from '@/lib/auth';
import { jstLocalToIso } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { parseTargetValues } from '@/lib/targets-parse';

const PRIORITIES = ['normal', 'important', 'urgent'] as const;

function parseTargets(f: FormData) {
  return parseTargetValues(f.getAll('target').map(String));
}

export type DraftResult = { id: string; orgId: string } | { error: string };

/** 手順1：下書きとして保存（添付ファイルを置く場所を作るため） */
export async function saveAnnouncementDraft(f: FormData): Promise<DraftResult> {
  const me = await requirePerm('announce');
  const title = String(f.get('title') ?? '').trim();
  const body = String(f.get('body') ?? '').trim();
  const priority = String(f.get('priority') ?? 'normal');
  const categoryId = String(f.get('category_id') ?? '') || null;
  const notifyNow = f.get('notify_immediately') === 'on' && priority === 'urgent' && me.role === 'admin';
  const mode = String(f.get('mode') ?? 'now');
  const publishAt = jstLocalToIso(String(f.get('publish_at') ?? ''));
  const targets = parseTargets(f);

  if (!title) return { error: 'タイトルを入力してください' };
  if (!PRIORITIES.includes(priority as (typeof PRIORITIES)[number])) return { error: '優先度が正しくありません' };
  if (mode !== 'draft' && targets.length === 0) return { error: '宛先を選んでください' };
  if (mode === 'schedule' && (!publishAt || new Date(publishAt) <= new Date())) return { error: '予約日時は現在より後の日時を指定してください' };

  const supabase = await createClient();
  const { data: a, error } = await supabase
    .from('announcements')
    .insert({ org_id: me.org_id, title, body, priority, category_id: categoryId, created_by: me.id, notify_immediately: notifyNow })
    .select('id')
    .single();
  if (error || !a) return { error: '保存できませんでした：' + error?.message };

  if (targets.length) {
    const { error: te } = await supabase.from('announcement_targets').insert(targets.map((t) => ({ ...t, announcement_id: a.id })));
    if (te) {
      await supabase.from('announcements').delete().eq('id', a.id);
      return { error: '担当範囲外の宛先が含まれているため保存できませんでした' };
    }
  }
  return { id: a.id as string, orgId: me.org_id };
}

/** 手順2：添付ファイルのアップロード後に、配信・予約する */
export async function finalizeAnnouncement(id: string, mode: string, publishAtLocal: string): Promise<{ error?: string; url?: string }> {
  await requirePerm('announce');
  let msg = '下書きを保存しました';
  if (mode !== 'draft') {
    const supabase = await createClient();
    const publishAt = mode === 'schedule' ? jstLocalToIso(publishAtLocal) : null;
    const { data: n, error } = await supabase.rpc('publish_announcement', { p_id: id, p_publish_at: publishAt });
    if (error) return { url: `/admin/announcements/${id}?error=` + encodeURIComponent('配信できませんでした：' + error.message) };
    msg = mode === 'schedule' ? '予約しました' : `${n}人に配信しました`;
  }
  revalidatePath('/admin/announcements');
  return { url: `/admin/announcements/${id}?message=` + encodeURIComponent(msg) };
}

export async function publishNow(id: string) {
  await requirePerm('announce');
  const supabase = await createClient();
  await supabase.from('announcements').update({ status: 'draft', publish_at: null }).eq('id', id).eq('status', 'scheduled');
  const { data: n, error } = await supabase.rpc('publish_announcement', { p_id: id });
  if (error) redirect(`/admin/announcements/${id}?error=` + encodeURIComponent(error.message));
  revalidatePath(`/admin/announcements/${id}`);
  redirect(`/admin/announcements/${id}?message=` + encodeURIComponent(`${n}人に配信しました`));
}

export async function cancelSchedule(id: string) {
  await requirePerm('announce');
  const supabase = await createClient();
  await supabase.from('announcements').update({ status: 'draft', publish_at: null }).eq('id', id).eq('status', 'scheduled');
  revalidatePath(`/admin/announcements/${id}`);
  redirect(`/admin/announcements/${id}?message=` + encodeURIComponent('予約を取り消し、下書きに戻しました'));
}

export async function editAnnouncement(id: string, f: FormData) {
  await requirePerm('announce');
  const supabase = await createClient();
  const { data: cur } = await supabase.from('announcements').select('status').eq('id', id).single();
  const { error } = await supabase
    .from('announcements')
    .update({
      title: String(f.get('title') ?? '').trim(),
      body: String(f.get('body') ?? '').trim(),
      priority: String(f.get('priority') ?? 'normal'),
      category_id: String(f.get('category_id') ?? '') || null,
      ...(cur?.status === 'published' ? { edited_at: new Date().toISOString() } : {}),
    })
    .eq('id', id);
  if (error) redirect(`/admin/announcements/${id}?error=` + encodeURIComponent('保存できませんでした：' + error.message));
  revalidatePath(`/admin/announcements/${id}`);
  redirect(`/admin/announcements/${id}?message=` + encodeURIComponent('保存しました'));
}

export async function deleteAnnouncement(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from('announcements').delete().eq('id', id);
  revalidatePath('/admin/announcements');
  redirect('/admin/announcements?message=' + encodeURIComponent('削除しました'));
}

export async function remindAnnouncement(id: string) {
  await requirePerm('announce');
  const supabase = await createClient();
  const { data: n, error } = await supabase.rpc('remind_announcement', { p_id: id });
  if (error) redirect(`/admin/announcements/${id}?error=` + encodeURIComponent(error.message));
  redirect(`/admin/announcements/${id}?message=` + encodeURIComponent(`未読の${n}人に再通知しました（時間外の場合は翌朝に届きます）`));
}
