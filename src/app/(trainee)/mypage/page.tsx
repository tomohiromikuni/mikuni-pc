import { Button, Card, LinkButton, PageTitle } from '@/components/ui';
import { requireTrainee } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

export default async function MyPage() {
  const me = await requireTrainee();
  const supabase = await createClient();
  const [{ data: detail }, { data: enr }] = await Promise.all([
    supabase.from('trainee_details').select('*').eq('profile_id', me.id).maybeSingle(),
    supabase
      .from('enrollments')
      .select('classes(name, courses(name))')
      .eq('trainee_id', me.id)
      .is('ended_on', null)
      .maybeSingle(),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cls = (enr as any)?.classes;
  const rows: [string, string][] = [
    ['氏名', me.full_name],
    ['フリガナ', me.full_name_kana || '—'],
    ['メールアドレス', detail?.email ?? '—'],
    ['電話番号', detail?.phone || '—'],
    ['コース', cls?.courses?.name ?? '—'],
    ['クラス', cls?.name ?? '—'],
    ['入校日', formatDate(detail?.enrolled_on)],
    ['修了予定日', formatDate(detail?.expected_completion_on)],
  ];
  return (
    <div className="space-y-4">
      <PageTitle>マイページ</PageTitle>
      <Card>
        <dl className="divide-y line">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-4 py-2">
              <dt className="muted w-28 shrink-0 text-sm">{k}</dt>
              <dd className="min-w-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="muted mt-3 text-xs">登録内容に誤りがある場合は、事務局にお知らせください。</p>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-bold">スマホのホーム画面に追加</h2>
        <p className="text-sm">
          <strong>iPhone：</strong>Safariで開き、下の共有ボタン（□に↑）→「ホーム画面に追加」
          <br />
          <strong>Android：</strong>Chromeで開き、右上の「︙」→「ホーム画面に追加」
        </p>
        <p className="muted text-xs">ホーム画面から開くと、アプリのように使えます（通知機能は開発段階5で追加予定）。</p>
      </Card>
      <div className="flex flex-col gap-3">
        <LinkButton href="/password" variant="secondary">パスワードを変更</LinkButton>
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="secondary" className="w-full">ログアウト</Button>
        </form>
      </div>
    </div>
  );
}
