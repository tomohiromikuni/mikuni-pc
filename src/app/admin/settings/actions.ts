'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin, requireStaff } from '@/lib/auth';
import { importHolidays } from '@/lib/holiday-import';
import { createClient } from '@/lib/supabase/server';

const back = (k: 'error' | 'message', m: string) => redirect(`/admin/settings?${k}=${encodeURIComponent(m)}`);

export async function importHolidaysNow() {
  const me = await requireStaff();
  try {
    const r = await importHolidays([me.org_id]);
    revalidatePath('/admin/settings');
    back('message', `祝日を${r.imported}件取り込みました（${r.latest} まで）`);
  } catch (e) {
    back('error', (e as Error).message + '。手動で祝日を追加することもできます');
  }
}

export async function addCalendarDay(f: FormData) {
  const me = await requireStaff();
  const from = String(f.get('from') ?? '');
  const to = String(f.get('to') ?? '') || from;
  const kind = String(f.get('kind')) === 'holiday' ? 'holiday' : 'closure';
  const name = String(f.get('name') ?? '').trim().slice(0, 100);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || to < from) back('error', '日付を正しく入力してください');
  const days: string[] = [];
  for (let d = new Date(from + 'T00:00:00Z'); d <= new Date(to + 'T00:00:00Z') && days.length < 60; d = new Date(d.getTime() + 86400000))
    days.push(d.toISOString().slice(0, 10));
  const supabase = await createClient();
  const { error } = await supabase.from('calendar_days').upsert(days.map((day) => ({ org_id: me.org_id, day, kind, name })), { onConflict: 'org_id,day' });
  if (error) back('error', error.message);
  revalidatePath('/admin/settings');
  back('message', `${days.length}日を登録しました`);
}

export async function deleteCalendarDay(day: string) {
  const me = await requireAdmin();
  const supabase = await createClient();
  await supabase.from('calendar_days').delete().eq('org_id', me.org_id).eq('day', day);
  revalidatePath('/admin/settings');
}

/** 休校日を期間ごとまとめて削除する */
export async function deleteCalendarRange(from: string, to: string) {
  const me = await requireAdmin();
  const supabase = await createClient();
  await supabase.from('calendar_days').delete().eq('org_id', me.org_id).eq('kind', 'closure').gte('day', from).lte('day', to);
  revalidatePath('/admin/settings');
}
