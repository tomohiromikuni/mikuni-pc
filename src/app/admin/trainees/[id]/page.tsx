import Link from 'next/link';
import { notFound } from 'next/navigation';
import { InvitePanel } from '@/components/InvitePanel';
import { TraineeForm } from '@/components/TraineeForm';
import { Button, Card, Notice, PageTitle, type Flash } from '@/components/ui';
import { hasPerm, requireStaff } from '@/lib/auth';
import { getClassOptions } from '@/lib/classes';
import { formatDate, friendlyDateTime } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { STATUS_LABEL, type AccountStatus } from '@/lib/types';
import { openChatWithTrainee } from '../../chat/actions';
import { issueInvite, setTraineeSuspended, updateTrainee } from '../actions';

export default async function TraineeDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Flash> }) {
  const me = await requireStaff();
  const { id } = await params;
  const { error, message } = await searchParams;
  const supabase = await createClient();

  const { data: t } = await supabase.from('profiles').select('*').eq('id', id).eq('role', 'trainee').maybeSingle();
  if (!t) notFound(); // 担当外の訓練生は「存在しない」扱い

  const [canChat, canManage, canPii, classes, { data: detail }, { data: enrollments }, { data: invites }, { data: reads }] = await Promise.all([
    hasPerm('chat'),
    hasPerm('manage_trainees'),
    hasPerm('view_pii'),
    getClassOptions(),
    supabase.from('trainee_details').select('*').eq('profile_id', id).maybeSingle(),
    supabase.from('enrollments').select('id, class_id, started_on, ended_on, classes(name, courses(name))').eq('trainee_id', id).order('started_on', { ascending: false }),
    supabase.from('invitations').select('created_at, expires_at, used_at, revoked_at').eq('profile_id', id).order('created_at', { ascending: false }).limit(1),
    supabase.from('announcement_recipients').select('read_at, announcements(id, title, published_at)').eq('trainee_id', id).limit(20),
  ]);
  const { data: surveyHist } = await supabase
    .from('survey_recipients')
    .select('responded_at, surveys(id, kind, title, target_date, published_at)')
    .eq('trainee_id', id)
    .limit(100);
  const { data: myAnswers } = await supabase
    .from('survey_responses')
    .select('survey_id, survey_answers(option_id, text_value, survey_options(label))')
    .eq('trainee_id', id);
  const answerMap = new Map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (myAnswers ?? []).map((r: any) => [r.survey_id, (r.survey_answers ?? []).map((a: any) => a.survey_options?.label ?? a.text_value).filter(Boolean).join('／')]),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hist = ((surveyHist ?? []) as any[]).filter((h) => h.surveys).sort((a, b) => (b.surveys.published_at ?? '').localeCompare(a.surveys.published_at ?? ''));
  const current = (enrollments ?? []).find((e) => !e.ended_on);
  if (canPii && detail) await supabase.rpc('log_action', { p_action: 'trainee.view_pii', p_target_type: 'profile', p_target_id: id, p_detail: { name: t.full_name } });
  const status = t.status as AccountStatus;
  const lastInvite = invites?.[0];

  return (
    <div className="space-y-6">
      <Link href="/admin/trainees" className="text-sm font-bold text-brand-700">‹ 訓練生一覧</Link>
      <PageTitle>
        {t.full_name} <span className="muted text-base font-normal">{t.full_name_kana}</span>
        <span className="ml-3 rounded-md bg-black/5 px-2 py-0.5 align-middle text-sm">{STATUS_LABEL[status]}</span>
      </PageTitle>
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
            values={{ ...t, ...(detail ?? {}), class_id: current?.class_id ?? '' }}
          />
        ) : (
          <dl className="grid gap-2 sm:grid-cols-2">
            {canPii && <div><dt className="muted text-sm">メール</dt><dd>{detail?.email}</dd></div>}
            {canPii && <div><dt className="muted text-sm">電話</dt><dd>{detail?.phone || '—'}</dd></div>}
            <div><dt className="muted text-sm">修了予定日</dt><dd>{formatDate(detail?.expected_completion_on)}</dd></div>
          </dl>
        )}
        {!canPii && <p className="muted mt-2 text-xs">連絡先（メール・電話）を見る権限がないため表示していません。</p>}
      </Card>

      {canManage && status !== 'suspended' && (
        <Card>
          <h2 className="mb-2 font-bold">招待</h2>
          {lastInvite && (
            <p className="muted mb-2 text-sm">
              前回の発行：{friendlyDateTime(lastInvite.created_at)}（
              {lastInvite.used_at ? `${friendlyDateTime(lastInvite.used_at)} に登録済み` : lastInvite.revoked_at ? '無効化済み' : new Date(lastInvite.expires_at) < new Date() ? '期限切れ' : '未使用'}）
            </p>
          )}
          <InvitePanel issue={issueInvite.bind(null, id)} name={t.full_name} alreadyActive={status === 'active'} />
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

      {me.role === 'admin' && (
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
