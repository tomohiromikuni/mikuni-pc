import { SettingsTabs } from '@/components/AdminNav';
import { PushSetup } from '@/components/PushSetup';
import { Button, Card, Field, Notice, type Flash } from '@/components/ui';
import { requireStaff } from '@/lib/auth';
import { env } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { addCalendarDay, deleteCalendarRange, importHolidaysNow } from './actions';
import { groupClosures, groupHolidaysByMonth, shortDay } from '@/lib/calendar-group';

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Flash> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
  const [{ data: days }, { data: cov }] = await Promise.all([
    supabase.from('calendar_days').select('day, kind, name').gte('day', today).order('day').limit(400),
    supabase.rpc('push_coverage'),
  ]);
  const c = (cov ?? [])[0] ?? { trainees: 0, with_push: 0 };
  const isAdmin = me.role === 'admin';
  const closures = groupClosures(days ?? []);
  const holidays = groupHolidaysByMonth(days ?? []);

  return (
    <div className="space-y-6">
      <SettingsTabs isAdmin={me.role === 'admin'} />
      <Notice error={sp.error} message={sp.message} />

      <Card className="space-y-2">
        <h2 className="font-bold">あなたの端末の通知</h2>
        <PushSetup vapidKey={env.vapidPublicKey()} audience="staff" />
        <p className="muted text-xs">スタッフ・管理者への通知（訓練生からのチャットなど）は時間帯の制限なく届きます。</p>
      </Card>

      <Card>
        <h2 className="mb-1 font-bold">訓練生の通知の設定状況</h2>
        <p>
          通知を受け取れる訓練生：<strong>{c.with_push}</strong> / {c.trainees} 人
          {c.trainees > 0 && `（${Math.round((c.with_push / c.trainees) * 100)}%）`}
        </p>
        <p className="muted mt-1 text-xs">通知を設定していない人も、アプリを開けばお知らせは確認できます。iPhoneはホーム画面への追加が必要です。</p>
      </Card>

      {/* 通知しない日（デザイン案A：休校日を主役に・祝日は月ごとにまとめる） */}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="flex-1 text-lg font-bold">通知しない日</h2>
        </div>
        <ul className="grid gap-2.5 rounded-xl bg-black/[0.03] p-3 text-[13px] leading-relaxed sm:grid-cols-3">
          <li><strong className="block">夜・土日</strong>平日20時〜翌7時と土日は送らない</li>
          <li><strong className="block">祝日・休校日</strong>下の日も送らない</li>
          <li><strong className="block">まとめて送る</strong>次の平日の朝7時に1通だけ</li>
        </ul>
        <p className="muted text-xs">受講が終わった人には、就職状況の確認などの依頼だけを送り、お知らせ・チャットの通知は送りません。</p>
      </Card>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="flex-1 font-bold">休校日（学校で決めた休み）</h3>
        </div>
        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-xl bg-brand-600 px-4 font-bold text-white hover:brightness-95 [&::-webkit-details-marker]:hidden">
            ＋ 休校日を追加
          </summary>
          <form action={addCalendarDay} className="mt-3 grid gap-3 rounded-xl bg-black/[0.03] p-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
            <input type="hidden" name="kind" value="closure" />
            <Field label="いつから"><input type="date" name="from" required /></Field>
            <Field label="いつまで（1日だけなら空欄）"><input type="date" name="to" /></Field>
            <Field label="名前"><input name="name" placeholder="例：年末年始休校" /></Field>
            <Button type="submit">追加</Button>
          </form>
        </details>
        {closures.length === 0 ? (
          <p className="muted text-sm">登録されている休校日はありません。</p>
        ) : (
          <ul className="space-y-2">
            {closures.map((c) => (
              <li key={c.from} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-amber-950">
                <span className="font-bold sm:min-w-52">{c.from === c.to ? shortDay(c.from) : `${shortDay(c.from)} 〜 ${shortDay(c.to)}`}</span>
                <span className="min-w-0 flex-1">{c.name || '休校日'}</span>
                <span className="text-xs opacity-80">{c.days}日間</span>
                {isAdmin && (
                  <form action={deleteCalendarRange.bind(null, c.from, c.to)}>
                    <button className="min-h-9 px-1 text-sm font-bold text-red-700">削除</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="flex-1 font-bold">祝日（自動で入ります）</h3>
          <form action={importHolidaysNow}>
            <button className="min-h-9 text-sm font-bold text-brand-700 underline">最新にする</button>
          </form>
        </div>
        {holidays.length === 0 ? (
          <p className="muted text-sm">まだ入っていません。「最新にする」を押すと、内閣府のデータから取り込みます。</p>
        ) : (
          <>
            <HolidayRows groups={holidays.slice(0, 6)} />
            {holidays.length > 6 && (
              <details>
                <summary className="min-h-9 cursor-pointer py-2 text-sm font-bold text-brand-700">もっと見る（あと{holidays.slice(6).reduce((n, g) => n + g.items.length, 0)}日）</summary>
                <HolidayRows groups={holidays.slice(6)} />
              </details>
            )}
          </>
        )}
      </Card>

    </div>
  );
}

function HolidayRows({ groups }: { groups: { label: string; items: { day: string; text: string }[] }[] }) {
  return (
    <dl className="grid grid-cols-[6.5rem_1fr] text-sm">
      {groups.map((g) => (
        <div key={g.label} className="line col-span-2 grid grid-cols-subgrid border-t py-2">
          <dt className="muted font-bold">{g.label}</dt>
          <dd>{g.items.map((i) => i.text).join('　・　')}</dd>
        </div>
      ))}
    </dl>
  );
}
