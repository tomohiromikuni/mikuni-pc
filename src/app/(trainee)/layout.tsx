import { TraineeNav } from '@/components/TraineeNav';
import { requireTrainee } from '@/lib/auth';
import { env } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { countUnread } from '@/lib/trainee-data';

export default async function TraineeLayout({ children }: { children: React.ReactNode }) {
  // 本人確認と件数の取得を同時に行う（待ち時間を1回分に）
  const supabase = await createClient();
  const [, unread, { data: chatUnread }, { data: todo }] = await Promise.all([
    requireTrainee(),
    countUnread(),
    supabase.rpc('my_chat_unread'),
    supabase.rpc('my_pending_surveys'),
  ]);
  return (
    <div className="min-h-dvh pb-24">
      <header className="sticky top-0 z-10 bg-brand-600 pt-[env(safe-area-inset-top)] text-white">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-4">
          <span className="text-lg font-bold">{env.appName}</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-4">{children}</main>
      <TraineeNav unread={unread} chatUnread={chatUnread ?? 0} todo={todo ?? 0} />
    </div>
  );
}
