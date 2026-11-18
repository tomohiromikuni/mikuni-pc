import Link from 'next/link';
import { AnnouncementList } from '@/components/AnnouncementList';
import { Card, PriorityBadge } from '@/components/ui';
import { requireTrainee } from '@/lib/auth';
import { friendlyDateTime } from '@/lib/format';
import { PushSetup } from '@/components/PushSetup';
import { SurveyItem } from '@/components/SurveyItem';
import { env } from '@/lib/env';
import { listMyAnnouncements } from '@/lib/trainee-data';
import { listMySurveys } from '@/lib/trainee-surveys';

export default async function HomePage() {
  const me = await requireTrainee();
  const [items, surveys] = await Promise.all([listMyAnnouncements({ limit: 30 }), listMySurveys()]);
  const todo = surveys.filter((x) => !x.responded_at && x.open);
  const alerts = items.filter((a) => a.priority !== 'normal' && !a.read);
  const latest = items.slice(0, 5);

  return (
    <div className="space-y-6">
      <p className="text-lg">
        <strong>{me.full_name}</strong> さん、こんにちは
      </p>

      <PushSetup vapidKey={env.vapidPublicKey()} compact />

      {alerts.length > 0 && (
        <section aria-label="重要なお知らせ" className="space-y-2">
          {alerts.map((a) => (
            <Link
              key={a.id}
              href={`/announcements/${a.id}`}
              className={`block rounded-2xl border-2 p-4 ${
                a.priority === 'urgent' ? 'border-red-500 bg-red-50 text-red-950' : 'border-amber-400 bg-amber-50 text-amber-950'
              }`}
            >
              <span className="flex items-center gap-2">
                <PriorityBadge priority={a.priority} />
                <span className="text-xs">{friendlyDateTime(a.published_at)}</span>
              </span>
              <span className="mt-1 block text-lg font-bold">{a.title}</span>
            </Link>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-bold">📝 回答が必要なもの{todo.length > 0 && <span className="ml-1 text-red-600">（{todo.length}）</span>}</h2>
        {todo.length === 0 ? (
          <Card><p className="muted text-sm">いま回答が必要なものはありません。</p></Card>
        ) : (
          <ul className="surface divide-y line overflow-hidden rounded-2xl border">{todo.map((x) => <SurveyItem key={x.id} s={x} />)}</ul>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">📢 新着のお知らせ</h2>
          <Link href="/announcements" className="text-sm font-bold text-brand-700">すべて見る ›</Link>
        </div>
        <AnnouncementList items={latest} />
      </section>
    </div>
  );
}
