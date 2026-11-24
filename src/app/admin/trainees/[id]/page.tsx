import Link from 'next/link';
import { after } from 'next/server';
import { notFound } from 'next/navigation';
import { TempPasswordPanel } from '@/components/TempPasswordPanel';
import { TraineeForm } from '@/components/TraineeForm';
import { Button, Card, Notice, PageTitle, type Flash } from '@/components/ui';
import { hasPerm, requireStaff } from '@/lib/auth';
import { getClassOptions } from '@/lib/classes';
import { formatDate, friendlyDateTime } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { formatPhone } from '@/lib/phone';
import { formatStudentNo } from '@/lib/student-number';
import { STATUS_LABEL, type AccountStatus } from '@/lib/types';
import { openChatWithTrainee } from '../../chat/actions';
import { promoteTrainee } from '../../staff/actions';
import { issueTempPassword, setTraineeSuspended, updateTrainee } from '../actions';

export default async function TraineeDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Flash> }) {
  const me = await requireStaff();
  const { id } = await params;
  const { error, message } = await searchParams;
  const supabase = await createClient();

  const { data: t } = await supabase.from('profiles').select('*').eq('id', id).or('role.eq.trainee,also_trainee.eq.true').maybeSingle();
  if (!t) notFound(); // 担当外の訓練生は「存在しない」扱い

  const [canChat, canManage, canPii, classes, { data: detail }, { data: enrollments }, { data: reads }, { data: surveyHist }, { data: myAnswers }] = await Promise.all([
    hasPerm('chat'),
    hasPerm('manage_trainees'),
    hasPerm('view_pii'),
    getClassOptions(),
    supabase.from('trainee_details').select('*').eq('profile_id', id).maybeSingle(),
    supabase.from('enrollments').select('id, class_id, seat_no, started_on, ended_on, classes(name, courses(name, cohort_no))').eq('trainee_id', id).order('started_on', { ascending: false }),
    supabase.from('announcement_recipients').select('read_at, announcements(id, title, published_at)').eq('trainee_id', id).limit(20),
    supabase.from('survey_recipients').select('responded_at, surveys(id, kind, title, target_date, published_at)').eq('trainee_id', id).limit(100),
    supabase.from('survey_responses').select('survey_id, survey_answers(option_id, text_value, survey_options(label))').eq('trainee_id', id),
  ]);
  const answerMap = new Map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (myAnswers ?? []).map((r: any) => [r.survey_id, (r.survey_answers ?? []).map((a: any) => a.survey_options?.label ?? a.text_value).filter(Boolean).join('／')]),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hist = ((surveyHist ?? []) as any[]).filter((h) => h.surveys).sort((a, b) => (b.surveys.published_at ?? '').localeCompare(a.surveys.published_at ?? ''));
  const current = (enrollments ?? []).find((e) => !e.ended_on);
  // 操作ログは画面を返した後に記録（表示を待たせない）
  if (canPii && detail) after(async () => { await supabase.rpc('log_action', { p_action: 'trainee.view_pii', p_target_type: 'profile', p_target_id: id, p_detail: { name: t.full_name } }); });
  const status = t.status as AccountStatus;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const studentNo = formatStudentNo((current?.classes as any)?.courses?.cohort_no, current?.seat_no);

  return (
    <div className="space-y-6">
      <Link href="/admin/trainees" className="text-sm font-bold text-brand-700">‹ 訓練生一覧</Link>
      <PageTitle>
        {t.full_name} <span className="muted text-base font-normal">{t.full_name_kana}</span>
        <span className="ml-3 rounded-md bg-black/5 px-2 py-0.5 align-middle text-sm">{STATUS_LABEL[status]}</span>
      </PageTitle>
      {studentNo ? (
        <p className="-mt-2 text-sm">受講番号：<strong>{studentNo}</strong>（ログインに使います）</p>
      ) : (
        <p className="-mt-2 text-sm text-amber-800">受講番号がまだありません。下の「期の番号」（期の設定）と「出席番号」を入れると、本人が受講番号でログインできます。</p>
      )}
      <Notice error={error} message={message} />
      {canChat && (
        <form action={openChatWithTrainee.bind(null, id)}>
          <Button type="submit" variant="secondary">💬 チャットを開く</Button>
        </form>
      )}

      <Card>
        <h2 className="mb-3 font-bold">基本情報</h2>
        {canManage ? (
          <TraineeForm
            action={updateTrainee.bind(null, id)}
            classes={classes}
            submitLabel="保存する"
            showContact={canPii}
            values={{ ...t, ...(detail ?? {}), class_id: current?.class_id ?? '', seat_no: current?.seat_no ?? null }}
          />
        ) : (
          <dl className="grid gap-2 sm:grid-cols-2">
            {canPii && <div><dt className="muted text-sm">メール</dt><dd>{detail?.email || '—'}</dd></div>}
            {canPii && <div><dt className="muted text-sm">携帯番号</dt><dd>{formatPhone(detail?.phone) || '—'}</dd></div>}
            <div><dt className="muted text-sm">修了予定日</dt><dd>{formatDate(detail?.expected_completion_on)}</dd></div>
          </dl>
        )}
        {!canPii && <p className="muted mt-2 text-xs">連絡先（メール・電話）を見る権限がないため表示していません。</p>}
      </Card>

      {canManage && status === 'invited' && (
        <Card>
          <h2 className="mb-2 font-bold">登録待ち</h2>
          <p className="text-sm">
            まだ本人の登録が済んでいません。<Link href="/admin/join-qr" className="font-bold text-brand-700 underline">共通の登録用QR</Link>
            から登録してもらってください。名簿の<strong>受講番号（○期生 ○番）と氏名</strong>が一致すれば、自動的にこのアカウントにつながります。
          </p>
        </Card>
      )}

      {canManage && status === 'active' && (
        <Card>
          <h2 className="mb-2 font-bold">パスワードを忘れたとき</h2>
          <TempPasswordPanel issue={issueTempPassword.bind(null, id)} />
        </Card>
      )}

      <Card>
        <h2 className="mb-2 font-bold">所属の履歴</h2>
        <ul className="space-y-1 text-sm">
          {(enrollments ?? []).map((e) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const k = e.classes as any;
            return (
              <li key={e.id}>
                {formatDate(e.started_on)} 〜 {e.ended_on ? formatDate(e.ended_on) : '現在'}：{k?.courses?.name} / {k?.name}
              </li>
            );
          })}
          {(enrollments ?? []).length === 0 && <li className="muted">未所属</li>}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-2 font-bold">お知らせの既読状況（最近20件）</h2>
        <ul className="divide-y line text-sm">
          {(reads ?? []).map((r) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const a = r.announcements as any;
            return (
              <li key={a?.id} className="flex justify-between gap-3 py-1.5">
                <span className="truncate">{a?.title}</span>
                <span className={r.read_at ? 'muted shrink-0' : 'shrink-0 font-bold text-red-700'}>{r.read_at ? `既読 ${friendlyDateTime(r.read_at)}` : '未読'}</span>
              </li>
            );
          })}
          {(reads ?? []).length === 0 && <li className="muted">まだありません</li>}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-2 font-bold">出欠の履歴</h2>
        <ul className="divide-y line text-sm">
          {hist.filter((h) => h.surveys.kind === 'attendance').map((h) => (
            <li key={h.surveys.id} className="flex justify-between gap-3 py-1.5">
              <Link href={`/admin/surveys/${h.surveys.id}`} className="truncate hover:underline">{h.surveys.title}</Link>
              <span className={h.responded_at ? 'shrink-0 font-semibold' : 'shrink-0 text-red-700'}>{h.responded_at ? answerMap.get(h.surveys.id) || '回答済み' : '未回答'}</span>
            </li>
          ))}
          {hist.filter((h) => h.surveys.kind === 'attendance').length === 0 && <li className="muted py-1.5">まだありません</li>}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-2 font-bold">アンケートの回答履歴</h2>
        <ul className="divide-y line text-sm">
          {hist.filter((h) => h.surveys.kind === 'survey').map((h) => (
            <li key={h.surveys.id} className="flex justify-between gap-3 py-1.5">
              <Link href={`/admin/surveys/${h.surveys.id}`} className="truncate hover:underline">{h.surveys.title}</Link>
              <span className={h.responded_at ? 'muted shrink-0' : 'shrink-0 text-red-700'}>{h.responded_at ? `回答 ${friendlyDateTime(h.responded_at)}` : '未回答'}</span>
            </li>
          ))}
          {hist.filter((h) => h.surveys.kind === 'survey').length === 0 && <li className="muted py-1.5">まだありません</li>}
        </ul>
      </Card>

      {me.role === 'admin' && t.role === 'trainee' && status === 'active' && (
        <Card>
          <h2 className="mb-2 font-bold">運営メンバーにする</h2>
          <p className="mb-3 text-sm">この人を管理者・メンバーにします。今のログイン（携帯番号）のまま、管理画面と訓練生の画面を切り替えて使えます。訓練生としての所属・履歴もそのままです。</p>
          <form action={promoteTrainee.bind(null, id)} className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 font-normal"><input type="radio" name="role" value="admin" defaultChecked /> 管理者</label>
            <label className="flex items-center gap-2 font-normal"><input type="radio" name="role" value="staff" /> メンバー</label>
            <Button type="submit" variant="secondary">運営メンバーにする</Button>
          </form>
        </Card>
      )}

      {t.role !== 'trainee' && (
        <Card>
          <p className="text-sm">この人は運営メンバー（{t.role === 'admin' ? '管理者' : 'メンバー'}）で、訓練生としても参加しています。役割の変更は <a href={`/admin/staff/${id}`} className="font-bold text-brand-700 underline">スタッフ画面</a> から行います。</p>
        </Card>
      )}

      {me.role === 'admin' && t.role === 'trainee' && (
        <Card>
          <h2 className="mb-2 font-bold">アカウントの利用</h2>
          <form action={setTraineeSuspended.bind(null, id, status !== 'suspended')}>
            <Button type="submit" variant={status === 'suspended' ? 'primary' : 'danger'}>
              {status === 'suspended' ? '利用を再開する' : '利用を停止する'}
            </Button>
          </form>
          <p className="muted mt-2 text-xs">停止すると、すぐにログインできなくなります。データは消えません。</p>
        </Card>
      )}
    </div>
  );
}
