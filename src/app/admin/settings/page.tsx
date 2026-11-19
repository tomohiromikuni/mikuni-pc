import { SettingsTabs } from '@/components/AdminNav';
import { PushSetup } from '@/components/PushSetup';
import { Button, Card, Field, Notice, type Flash } from '@/components/ui';
import { requireStaff } from '@/lib/auth';
import { env } from '@/lib/env';
import { formatDate } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { addCalendarDay, deleteCalendarDay, importHolidaysNow } from './actions';

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Flash> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
  const [{ data: days }, { data: cov }] = await Promise.all([
    supabase.from('calendar_days').select('day, kind, name').gte('day', today).order('day').limit(120),
    supabase.rpc('push_coverage'),
  ]);
  const c = (cov ?? [])[0] ?? { trainees: 0, with_push: 0 };
  const isAdmin = me.role === 'admin';

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

      <Card className="space-y-3">
        <h2 className="font-bold">通知しない日（祝日・休校日）</h2>
        <p className="text-sm">訓練生への通知は、平日20時〜翌7時・土日・下の日には送らず、次の平日の朝7時にまとめて1通送ります。受講が終わった人（期を修了にした・期の終了日や修了予定日を過ぎた）には、就職状況の確認などの依頼だけを送り、お知らせ・チャットの通知は送りません。</p>
        {isAdmin && (
          <>
            <form action={importHolidaysNow}>
              <Button type="submit" variant="secondary">内閣府の祝日データを取り込む</Button>
            </form>
            <form action={addCalendarDay} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_2fr_auto] sm:items-end">
              <Field label="開始日"><input type="date" name="from" required /></Field>
              <Field label="終了日（1日だけなら空欄）"><input type="date" name="to" /></Field>
              <Field label="種類">
                <select name="kind" defaultValue="closure"><option value="closure">休校日</option><option value="holiday">祝日</option></select>
              </Field>
              <Field label="名前"><input name="name" placeholder="例：年末年始休校" /></Field>
              <Button type="submit">追加</Button>
            </form>
          </>
        )}
        <ul className="divide-y line text-sm">
          {(days ?? []).map((d) => (
            <li key={d.day} className="flex items-center gap-3 py-1.5">
              <span className="w-28">{formatDate(d.day)}</span>
              <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${d.kind === 'closure' ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-800'}`}>{d.kind === 'closure' ? '休校日' : '祝日'}</span>
              <span className="flex-1">{d.name}</span>
              {isAdmin && (
                <form action={deleteCalendarDay.bind(null, d.day)}>
                  <button className="text-xs text-red-700 underline">削除</button>
                </form>
              )}
            </li>
          ))}
          {(days ?? []).length === 0 && <li className="muted py-2">登録されていません。「祝日データを取り込む」を押してください。</li>}
        </ul>
      </Card>

    </div>
  );
}
