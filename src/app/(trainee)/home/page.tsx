import Link from 'next/link';
import { PushSetup } from '@/components/PushSetup';
import { PriorityBadge, UnreadDot } from '@/components/ui';
import { requireTrainee } from '@/lib/auth';
import { env } from '@/lib/env';
import { friendlyDateTime } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { listMyAnnouncements } from '@/lib/trainee-data';
import { listMySurveys } from '@/lib/trainee-surveys';

/** 時間帯のあいさつ（日本時間） */
function greeting(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Tokyo', hour: 'numeric', hour12: false }).format(now)) % 24;
  return h < 11 ? 'おはようございます' : h < 18 ? 'こんにちは' : 'こんばんは';
}

/** 訓練生ホーム（デザイン案A：ダッシュボード） */
export default async function HomePage() {
  const me = await requireTrainee();
  const supabase = await createClient();
  const [items, surveys, { data: org }, { data: enr }, { data: chatUnread }] = await Promise.all([
    listMyAnnouncements({ limit: 30 }),
    listMySurveys(),
    supabase.from('organizations').select('name').eq('id', me.org_id).maybeSingle(),
    supabase.from('enrollments').select('classes(name, courses(name))').eq('trainee_id', me.id).is('ended_on', null).maybeSingle(),
    supabase.rpc('my_chat_unread'),
  ]);
  const todo = surveys.filter((x) => !x.responded_at && x.open);
  const unread = items.filter((a) => !a.read).length;
  const alerts = items.filter((a) => a.priority !== 'normal' && !a.read);
  const latest = items.slice(0, 5);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cls = (enr as any)?.classes;

  const tiles = [
    { href: '/announcements', label: '未読のお知らせ', n: unread, color: 'text-red-700' },
    { href: '/answers', label: '回答が必要', n: todo.length, color: 'text-amber-700' },
    { href: '/chat', label: '事務局から', n: (chatUnread as number) ?? 0, color: 'text-brand-700' },
  ];

  return (
    <div className="-mx-4 -mt-4">
      <header className="bg-brand-600 px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-14 text-white">
        <p className="text-[13px] opacity-90">{org?.name ?? env.appName}</p>
        <p className="mt-1 text-[22px] leading-snug font-bold">
          {me.full_name} さん、{greeting()}
        </p>
        {cls && <p className="mt-1 text-[13px] opacity-90">{cls.courses?.name} {cls.name}</p>}
      </header>

      <div className="-mt-10 space-y-4 px-4">
        <div className="grid grid-cols-3 gap-2.5">
          {tiles.map((t) => (
            <Link key={t.href} href={t.href} className="surface flex flex-col gap-0.5 rounded-2xl px-2.5 py-3 shadow-[0_2px_8px_rgba(31,42,38,0.08)]">
              <span className="muted text-xs">{t.label}</span>
              <span className={`text-[28px] leading-tight font-bold ${t.n > 0 ? t.color : 'muted'}`}>
                {t.n}
                <span className="muted text-[13px] font-normal"> 件</span>
              </span>
            </Link>
          ))}
        </div>

        <PushSetup vapidKey={env.vapidPublicKey()} compact />

        {alerts.map((a) => (
          <Link
            key={a.id}
            href={`/announcements/${a.id}`}
            className={`block rounded-2xl border-2 px-4 py-3 ${a.priority === 'urgent' ? 'border-red-600 bg-red-50 text-red-950' : 'border-amber-400 bg-amber-50 text-amber-950'}`}
          >
            <PriorityBadge priority={a.priority} />
            <span className="mt-1 block text-base font-bold">{a.title}</span>
            <span className="block text-xs">{friendlyDateTime(a.published_at)}</span>
          </Link>
        ))}

        <section className="surface space-y-2.5 rounded-2xl p-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-bold">回答が必要なもの</h2>
            {todo.length > 0 && <Link href="/answers" className="text-[13px] font-bold text-brand-700">すべて見る</Link>}
          </div>
          {todo.length === 0 ? (
            <p className="muted text-sm">いま回答が必要なものはありません。</p>
          ) : (
            todo.slice(0, 4).map((s) => (
              <Link key={s.id} href={`/answers/${s.id}`} className="flex items-center gap-2.5">
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold ${s.kind === 'attendance' ? 'bg-sky-100 text-sky-800' : 'bg-violet-100 text-violet-800'}`}>
                  {s.kind === 'attendance' ? '出欠' : 'アンケート'}
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px]">{s.title}</span>
                {s.due_at && <span className="shrink-0 text-xs text-amber-700">{friendlyDateTime(s.due_at)}まで</span>}
              </Link>
            ))
          )}
        </section>

        <section className="surface space-y-2.5 rounded-2xl p-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-bold">新着のお知らせ</h2>
            <Link href="/announcements" className="text-[13px] font-bold text-brand-700">すべて見る</Link>
          </div>
          {latest.length === 0 && <p className="muted text-sm">お知らせはまだありません。</p>}
          {latest.map((a) => (
            <Link key={a.id} href={`/announcements/${a.id}`} className="flex items-baseline gap-2.5">
              <span className="w-2 shrink-0">{!a.read && <UnreadDot />}</span>
              <span className={`min-w-0 flex-1 truncate text-[15px] ${a.read ? '' : 'font-bold'}`}>{a.title}</span>
              {a.attachmentCount > 0 && <span className="muted shrink-0 text-xs">📎</span>}
              <span className="muted shrink-0 text-xs">{friendlyDateTime(a.published_at).replace(/ \d+:\d+$/, '')}</span>
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
