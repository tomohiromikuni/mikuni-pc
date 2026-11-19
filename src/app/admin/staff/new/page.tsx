import { redirect } from 'next/navigation';

/** スタッフの追加は一覧の「＋ スタッフを追加」（ポップアップ）で行う */
export default function NewStaffPage() {
  redirect('/admin/staff');
}
