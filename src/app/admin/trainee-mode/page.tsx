import { redirect } from 'next/navigation';
import { Button, Card, Field, Notice, PageTitle, type Flash } from '@/components/ui';
import { requireStaff } from '@/lib/auth';
import { getClassOptions } from '@/lib/classes';
import { setAlsoTrainee } from '../staff/actions';

/** 訓練生モード：まだ「訓練生としても参加」していない運営メンバー向けの案内 */
export default async function TraineeModePage({ searchParams }: { searchParams: Promise<Flash> }) {
  const me = await requireStaff();
  if (me.also_trainee) redirect('/home');
  const sp = await searchParams;
  const classes = me.role === 'admin' ? await getClassOptions() : [];
  return (
    <div className="max-w-xl space-y-4">
      <PageTitle>訓練生モード</PageTitle>
      <Notice error={sp.error} message={sp.message} />
      <Card className="space-y-3">
        <p>
          訓練生モードでは、訓練生と同じ画面でお知らせ・出欠・事務局チャットを使えます。
          使うには、あなたのアカウントを「<strong>訓練生としても参加</strong>」にする必要があります。
        </p>
        <p className="muted text-sm">参加すると、選んだクラスあてのお知らせや出欠確認が、あなたにも届くようになります。</p>
        {me.role === 'admin' ? (
          <form action={setAlsoTrainee.bind(null, me.id, '/admin/trainee-mode')} className="space-y-3">
            <input type="hidden" name="also_trainee" value="on" />
            <Field label="訓練生として所属するクラス">
              <select name="class_id" required defaultValue="">
                <option value="" disabled>選んでください</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </Field>
            <Button type="submit">訓練生としても参加する</Button>
          </form>
        ) : (
          <p className="font-semibold">管理者に「スタッフ」画面から、あなたを「訓練生としても参加」にしてもらってください。</p>
        )}
      </Card>
    </div>
  );
}
