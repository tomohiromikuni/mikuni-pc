import { Button, Card, Field, Notice, PageTitle, type Flash } from '@/components/ui';
import { requireAdmin } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { createClass, createCourse, renameClass, setClassArchived, setClassSignup, setCourseArchived, updateCourse } from './actions';

export default async function CoursesPage({ searchParams }: { searchParams: Promise<Flash & { archived?: string }> }) {
  await requireAdmin();
  const { error, message, archived } = await searchParams;
  const showArchived = archived === '1';
  const supabase = await createClient();
  const { data: courses } = await supabase
    .from('courses')
    .select('id, name, starts_on, ends_on, archived, classes(id, name, archived, open_for_signup, enrollments(id, ended_on))')
    .order('created_at');
  const list = (courses ?? []).filter((c) => showArchived || !c.archived);

  return (
    <div className="space-y-6">
      <PageTitle
        action={
          <div className="flex flex-wrap items-center gap-3">
            <a href="/admin/join-qr" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white">登録用QR（共通）</a>
            <a href={showArchived ? '/admin/courses' : '/admin/courses?archived=1'} className="text-sm font-bold text-brand-700 underline">
              {showArchived ? 'アーカイブを隠す' : 'アーカイブも表示'}
            </a>
          </div>
        }
      >
        コース・クラス
      </PageTitle>
      <Notice error={error} message={message} />
      <p className="text-sm">訓練生は共通の登録用QRから自分で登録します。登録画面には「<strong>登録受付中</strong>」にしたクラスだけが表示されます。期の受付が終わったらオフにしてください。</p>

      <Card>
        <h2 className="mb-3 font-bold">コースを追加</h2>
        <form action={createCourse} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
          <Field label="コース名"><input name="name" required placeholder="例：Webデザイン科 2026年11月生" /></Field>
          <Field label="開始日"><input name="starts_on" type="date" /></Field>
          <Field label="終了日"><input name="ends_on" type="date" /></Field>
          <Button type="submit">追加</Button>
        </form>
      </Card>

      {list.length === 0 && <p className="muted">まだコースがありません。上のフォームから追加してください。</p>}

      {list.map((c) => (
        <Card key={c.id} className={c.archived ? 'opacity-60' : ''}>
          <details>
            <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3">
              <span className="text-lg font-bold">{c.name}</span>
              <span className="muted text-sm">
                {formatDate(c.starts_on)} 〜 {formatDate(c.ends_on)}
                {c.archived && '（アーカイブ済み）'}
              </span>
              <span className="muted ml-auto text-xs">クリックで編集</span>
            </summary>
            <form action={updateCourse.bind(null, c.id)} className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
              <Field label="コース名"><input name="name" defaultValue={c.name} required /></Field>
              <Field label="開始日"><input name="starts_on" type="date" defaultValue={c.starts_on ?? ''} /></Field>
              <Field label="終了日"><input name="ends_on" type="date" defaultValue={c.ends_on ?? ''} /></Field>
              <Button type="submit" variant="secondary">保存</Button>
            </form>
            <form action={setCourseArchived.bind(null, c.id, !c.archived)} className="mt-2">
              <button className="text-sm text-red-700 underline">
                {c.archived ? 'アーカイブから戻す' : 'このコースをアーカイブ（非表示）にする'}
              </button>
            </form>
          </details>

          <ul className="mt-4 divide-y line rounded-xl border">
            {(c.classes ?? [])
              .filter((k) => showArchived || !k.archived)
              .map((k) => {
                const n = (k.enrollments ?? []).filter((e) => !e.ended_on).length;
                return (
                  <li key={k.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 ${k.archived ? 'opacity-60' : ''}`}>
                    <form action={renameClass.bind(null, k.id)} className="flex flex-1 items-center gap-2">
                      <input name="name" defaultValue={k.name} aria-label="クラス名" className="max-w-56" />
                      <Button type="submit" variant="secondary" className="min-h-9 px-3 py-1 text-sm">名前を保存</Button>
                    </form>
                    <span className="muted text-sm">{n}人</span>
                    {!k.archived && (
                      <form action={setClassSignup.bind(null, k.id, !k.open_for_signup)}>
                        <button className={`rounded-full px-3 py-1 text-xs font-bold ${k.open_for_signup ? 'bg-brand-600 text-white' : 'bg-black/10'}`} title="共通QRの登録画面に出すかどうか">
                          {k.open_for_signup ? '✓ 登録受付中' : '登録受付オフ'}
                        </button>
                      </form>
                    )}
                    <form action={setClassArchived.bind(null, k.id, !k.archived)}>
                      <button className="text-sm text-red-700 underline">{k.archived ? '戻す' : 'アーカイブ'}</button>
                    </form>
                  </li>
                );
              })}
          </ul>
          {!c.archived && (
            <form action={createClass.bind(null, c.id)} className="mt-3 flex gap-2">
              <input name="name" placeholder="新しいクラス名（例：A組）" aria-label="新しいクラス名" required />
              <Button type="submit" variant="secondary" className="shrink-0">クラス追加</Button>
            </form>
          )}
        </Card>
      ))}
    </div>
  );
}
