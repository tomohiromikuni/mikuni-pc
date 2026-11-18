'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const back = (e?: string, m?: string) =>
  redirect('/admin/courses' + (e ? `?error=${encodeURIComponent(e)}` : m ? `?message=${encodeURIComponent(m)}` : ''));

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const dateOrNull = (f: FormData, k: string) => str(f, k) || null;

export async function createCourse(f: FormData) {
  const me = await requireAdmin();
  const name = str(f, 'name');
  if (!name) back('コース名を入力してください');
  const supabase = await createClient();
  const { error } = await supabase
    .from('courses')
    .insert({ org_id: me.org_id, name, starts_on: dateOrNull(f, 'starts_on'), ends_on: dateOrNull(f, 'ends_on') });
  if (error) back('登録できませんでした：' + error.message);
  revalidatePath('/admin/courses');
  back(undefined, `コース「${name}」を登録しました`);
}

export async function updateCourse(id: string, f: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from('courses')
    .update({ name: str(f, 'name'), starts_on: dateOrNull(f, 'starts_on'), ends_on: dateOrNull(f, 'ends_on') })
    .eq('id', id);
  if (error) back('更新できませんでした：' + error.message);
  revalidatePath('/admin/courses');
  back(undefined, '保存しました');
}

export async function setCourseArchived(id: string, archived: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from('courses').update({ archived }).eq('id', id);
  await supabase.from('classes').update({ archived }).eq('course_id', id);
  revalidatePath('/admin/courses');
  back(undefined, archived ? 'アーカイブしました（過去の記録は残ります）' : '元に戻しました');
}

export async function createClass(courseId: string, f: FormData) {
  const me = await requireAdmin();
  const name = str(f, 'name');
  if (!name) back('クラス名を入力してください');
  const supabase = await createClient();
  const { error } = await supabase.from('classes').insert({ org_id: me.org_id, course_id: courseId, name });
  if (error) back('登録できませんでした：' + error.message);
  revalidatePath('/admin/courses');
  back(undefined, `クラス「${name}」を登録しました`);
}

export async function renameClass(id: string, f: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from('classes').update({ name: str(f, 'name') }).eq('id', id);
  revalidatePath('/admin/courses');
  back(undefined, '保存しました');
}

export async function setClassArchived(id: string, archived: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from('classes').update({ archived }).eq('id', id);
  revalidatePath('/admin/courses');
  back(undefined, archived ? 'クラスをアーカイブしました' : '元に戻しました');
}

export async function setClassSignup(id: string, open: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from('classes').update({ open_for_signup: open }).eq('id', id);
  revalidatePath('/admin/courses');
  back(undefined, open ? '登録の受付を開始しました（共通QRの登録画面に表示されます）' : '登録の受付を終了しました');
}
