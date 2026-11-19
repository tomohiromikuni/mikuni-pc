import { redirect } from 'next/navigation';

/** 「コース・クラス」は「訓練生・クラス」画面に統合した */
export default function CoursesPage() {
  redirect('/admin/trainees');
}
