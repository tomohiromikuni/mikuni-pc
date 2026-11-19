'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

/** 「訓練生・クラス」画面の、その期の設定欄を開いた状態に戻る */
function back(courseId: string | null, kind: 'error' | 'message', msg: string): never {
  revalidatePath('/admin/trainees');
  const q = new URLSearchParams({ [kind]: msg });
  if (courseId) {
    q.set('course', courseId);
    q.set('settings', '1');
  }
  redirect(`/admin/trainees?${q}`);
}

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const dateOrNull = (f: FormData, k: string) => str(f, k) || null;

/** 新しい期を作る（最初のクラスも一緒に作れる） */
export async function createCourse(f: FormData) {
  const me = await requireAdmin();
  const name = str(f, 'name');
  if (!name) back(null, 'error', '期の名前を入力してください（例：2026年11月期）');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('courses')
    .insert({ org_id: me.org_id, name, starts_on: dateOrNull(f, 'starts_on'), ends_on: dateOrNull(f, 'ends_on') })
    .select('id')
    .single();
  if (error || !data) back(null, 'error', '作成できませんでした：' + error?.message);
  const firstClass = str(f, 'first_class');
  if (firstClass) await supabase.from('classes').insert({ org_id: me.org_id, course_id: data!.id, name: firstClass });
  back(data!.id, 'message', `「${name}」を作りました。クラスと登録受付を設定してください`);
}

export async function updateCourse(id: string, f: FormData) {
  await requireAdmin();
  const name = str(f, 'name');
  if (!name) back(id, 'error', '期の名前を入力してください');
  const supabase = await createClient();
  const { error } = await supabase.from('courses').update({ name, starts_on: dateOrNull(f, 'starts_on'), ends_on: dateOrNull(f, 'ends_on') }).eq('id', id);
  if (error) back(id, 'error', '保存できませんでした：' + error.message);
  back(id, 'message', '期の情報を保存しました');
}

/** 期を修了にする（＝アーカイブ。過去の記録は残る）／元に戻す */
export async function setCourseArchived(id: string, archived: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from('courses').update({ archived }).eq('id', id);
  // 修了した期のクラスは、登録受付も止める
  await supabase.from('classes').update(archived ? { archived, open_for_signup: false } : { archived }).eq('course_id', id);
  back(id, 'message', archived ? 'この期を修了にしました（記録は残ります）' : '受講中に戻しました');
}

export async function createClass(courseId: string, f: FormData) {
  const me = await requireAdmin();
  const name = str(f, 'name');
  if (!name) back(courseId, 'error', 'クラス名を入力してください');
  const supabase = await createClient();
  const { error } = await supabase.from('classes').insert({ org_id: me.org_id, course_id: courseId, name });
  if (error) back(courseId, 'error', '追加できませんでした：' + error.message);
  back(courseId, 'message', `クラス「${name}」を追加しました`);
}

export async function renameClass(courseId: string, id: string, f: FormData) {
  await requireAdmin();
  const name = str(f, 'name');
  if (!name) back(courseId, 'error', 'クラス名を入力してください');
  const supabase = await createClient();
  await supabase.from('classes').update({ name }).eq('id', id);
  back(courseId, 'message', 'クラス名を保存しました');
}

export async function setClassArchived(courseId: string, id: string, archived: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from('classes').update(archived ? { archived, open_for_signup: false } : { archived }).eq('id', id);
  back(courseId, 'message', archived ? 'クラスを非表示にしました（記録は残ります）' : 'クラスを元に戻しました');
}

export async function setClassSignup(courseId: string, id: string, open: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from('classes').update({ open_for_signup: open }).eq('id', id);
  back(courseId, 'message', open ? '登録の受付を開始しました（共通QRの登録画面に表示されます）' : '登録の受付を終了しました');
}
