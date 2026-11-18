import { TraineeNav } from '@/components/TraineeNav';
import { requireTrainee } from '@/lib/auth';
import { env } from '@/lib/env';
import { countUnread } from '@/lib/trainee-data';

export default async function TraineeLayout({ children }: { children: React.ReactNode }) {
  await requireTrainee();
  const unread = await countUnread();
  return (
    <div className="min-h-dvh pb-24">
      <header className="sticky top-0 z-10 bg-brand-600 pt-[env(safe-area-inset-top)] text-white">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-4">
          <span className="text-lg font-bold">{env.appName}</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-4">{children}</main>
      <TraineeNav unread={unread} />
    </div>
  );
}
