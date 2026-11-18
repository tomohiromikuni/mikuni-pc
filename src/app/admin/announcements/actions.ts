'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin, requirePerm } from '@/lib/auth';
import { jstLocalToIso } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

const PRIORITIES = ['normal', 'important', 'urgent'] as const;

type Target = { target_type: 'all' | 'course' | 'class'; course_id: string | null; class_id: string | null };

function parseTargets(f: FormData): Target[] {
  const raw = f.getAll('target').map(String);
  if (raw.includes('all')) return [{ target_type: 'all', course_id: null, class_id: null }];
  return raw.flatMap((v): Target[] => {
    const [type, id] = v.split(':');
    if (type === 'course') return [{ target_type: 'course', course_id: id, class_id: null }];
    if (type === 'class') return [{ target_type: 'class', course_id: null, class_id: id }];
    return [];
  });
}

export async function createAnnouncement(f: FormData) {
  const me = await requirePerm('announce');
  const back = (e: string) => redirect('/admin/announcements/new?error=' + encodeURIComponent(e));
  const title = String(f.get('title') ?? '').trim();
  const body = String(f.get('body') ?? '').trim();
  const priority = String(f.get('priority') ?? 'normal');
  const categoryId = String(f.get('category_id') ?? '') || null;
  const mode = String(f.get('mode') ?? 'now');
  const publishAt = jstLocalToIso(String(f.get('publish_at') ?? ''));
  const targets = parseTargets(f);

  if (!title) back('タイトルを入力してください');
  if (!PRIORITIES.includes(priority as (typeof PRIORITIES)[number])) back('優先度が正しくありません');
  if (mode !== 'draft' && targets.length === 0) back('宛先を選んでください');
  if (mode === 'schedule' && (!publishAt || new Date(publishAt) <= new Date())) back('予約日時は現在より後の日時を指定してください');

  const supabase = await createClient();
  const { data: a, error } = await supabase
    .from('announcements')
    .insert({ org_id: me.org_id, title, body, priority, category_id: categoryId, created_by: me.id })
    .select('id')
    .single();
  if (error || !a) back('保存できませんでした：' + error?.message);
  const id = a!.id as string;

  if (targets.length) {
    const { error: te } = await supabase.from('announcement_targets').insert(targets.map((t) => ({ ...t, announcement_id: id })));
    if (te) {
      await supabase.from('announcements').delete().eq('id', id);
      back('担当範囲外の宛先が含まれているため保存できませんでした');
    }
  }

  let msg = '下書きを保存しました';
  if (mode !== 'draft') {
    const { data: n, error: pe } = await supabase.rpc('publish_announcement', { p_id: id, p_publish_at: mode === 'schedule' ? publishAt : null });
    if (pe) redirect(`/admin/announcements/${id}?error=` + encodeURIComponent('配信できませんでした：' + pe.message));
    msg = mode === 'schedule' ? '予約しました' : `${n}人に配信しました`;
  }
  revalidatePath('/admin/announcements');
  redirect(`/admin/announcements/${id}?message=` + encodeURIComponent(msg));
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
