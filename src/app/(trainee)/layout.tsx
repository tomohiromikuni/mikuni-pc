import { TraineeFrame } from '@/components/TraineeFrame';
import { requireTrainee } from '@/lib/auth';
import { env } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { countUnread } from '@/lib/trainee-data';

export default async function TraineeLayout({ children }: { children: React.ReactNode }) {
  // 本人確認と件数の取得を同時に行う（待ち時間を1回分に）
  const supabase = await createClient();
  const [me, unread, { data: chatUnread }, { data: todo }] = await Promise.all([
    requireTrainee(),
    countUnread(),
    supabase.rpc('my_chat_unread'),
    supabase.rpc('my_pending_surveys'),
  ]);
  return (
    <TraineeFrame appName={env.appName} unread={unread} chatUnread={chatUnread ?? 0} todo={todo ?? 0} staffMode={me.role !== 'trainee'}>
      {children}
    </TraineeFrame>
  );
}
