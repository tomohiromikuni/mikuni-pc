import { redirect } from 'next/navigation';

/** 訓練生の画面の確認は、端末を切り替えて見られる画面で行う */
export default function TraineeModePage() {
  redirect('/preview');
}
