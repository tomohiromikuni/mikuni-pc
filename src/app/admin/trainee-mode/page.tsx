import { redirect } from 'next/navigation';

/** 訓練生モードは、そのまま訓練生の画面を表示する（表示の確認用） */
export default function TraineeModePage() {
  redirect('/home');
}
