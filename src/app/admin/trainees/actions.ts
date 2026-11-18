'use server';
import QRCode from 'qrcode';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin, requirePerm } from '@/lib/auth';
import { env } from '@/lib/env';
import { INVITE_DAYS, newInviteToken } from '@/lib/invite';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const traineeSchema = z.object({
  full_name: z.string().trim().min(1, '氏名を入力してください').max(100),
  full_name_kana: z.string().trim().max(100),
  email: z.string().trim().toLowerCase().pipe(z.email('メールアドレスの形式が正しくありません')),
  phone: z.string().trim().max(20),
  class_id: z.string().trim(),
  enrolled_on: z.string().trim(),
  expected_completion_on: z.string().trim(),
});

function parse(f: FormData, withContact = true) {
  const schema = withContact ? traineeSchema : traineeSchema.omit({ email: true, phone: true });
  const r = schema.safeParse(Object.fromEntries(['full_name', 'full_name_kana', 'email', 'phone', 'class_id', 'enrolled_on', 'expected_completion_on'].map((k) => [k, String(f.get(k) ?? '')])));
  if (!r.success) return { error: r.error.issues[0].message } as const;
  return { data: r.data as z.infer<typeof traineeSchema> } as const;
}

const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());

type TraineeValues = z.infer<typeof traineeSchema>;
type Me = { id: string; org_id: string; role: string };

/** 訓練生を1人登録する（ログインアカウント → 本人の権限で各表へ）。失敗時は元に戻してエラー文を返す */
async function createTraineeRecord(me: Me, v: TraineeValues): Promise<{ id?: string; error?: string }> {
  const admin = createAdminClient();
  const { data: created, error: authErr } = await admin.auth.admin.createUser({ email: v.email, email_confirm: true });
  if (authErr || !created.user) {
    return {
      error: /already|registered|exists/i.test(authErr?.message ?? '')
        ? 'このメールアドレスはすでに登録されています'
        : '登録できませんでした：' + authErr?.message,
    };
  }
  const id = created.user.id;
  const supabase = await createClient();
  const steps = [
    () => supabase.from('profiles').insert({ id, org_id: me.org_id, role: 'trainee', status: 'invited', full_name: v.full_name, full_name_kana: v.full_name_kana }),
    () => (v.class_id ? supabase.from('enrollments').insert({ org_id: me.org_id, trainee_id: id, class_id: v.class_id, started_on: v.enrolled_on || today() }) : Promise.resolve({ error: null })),
    () => supabase.from('trainee_details').insert({ profile_id: id, email: v.email, phone: v.phone, enrolled_on: v.enrolled_on || null, expected_completion_on: v.expected_completion_on || null }),
  ];
  for (const step of steps) {
    const { error } = await step();
    if (error) {
      await admin.auth.admin.deleteUser(id);
      return { error: '登録できませんでした：' + error.message };
    }
  }
  return { id };
}

export async function createTrainee(f: FormData) {
  const me = await requirePerm('manage_trainees');
  const p = parse(f);
  if ('error' in p) redirect('/admin/trainees/new?error=' + encodeURIComponent(p.error!));
  const r = await createTraineeRecord(me, p.data!);
  if (r.error) redirect('/admin/trainees/new?error=' + encodeURIComponent(r.error));
  revalidatePath('/admin/trainees');
  redirect(`/admin/trainees/${r.id}?message=` + encodeURIComponent('登録しました。次に招待URLを発行してください'));
}

/** 一括登録の確認画面用：すでに登録済みのメールアドレスを返す */
export async function findExistingEmails(emails: string[]): Promise<string[]> {
  await requirePerm('manage_trainees');
  const list = [...new Set(emails.map((e) => e.toLowerCase()).filter(Boolean))].slice(0, 1000);
  if (list.length === 0) return [];
  const admin = createAdminClient();
  const { data } = await admin.from('trainee_details').select('email').in('email', list);
  return (data ?? []).map((r) => r.email);
}

export type ImportInput = Omit<TraineeValues, never> & { line: number };
export type ImportResult = { succeeded: number; failed: { line: number; name: string; error: string }[] };

/** 一括登録（確認画面でエラーのなかった行だけが送られてくる。念のためここでも再チェック） */
export async function importTrainees(rows: ImportInput[], fileName: string): Promise<ImportResult> {
  const me = await requirePerm('manage_trainees');
  const result: ImportResult = { succeeded: 0, failed: [] };
  for (const row of rows.slice(0, 500)) {
    const v = traineeSchema.safeParse(row);
    if (!v.success) {
      result.failed.push({ line: row.line, name: row.full_name, error: v.error.issues[0].message });
      continue;
    }
    const r = await createTraineeRecord(me, v.data);
    if (r.error) result.failed.push({ line: row.line, name: row.full_name, error: r.error });
    else result.succeeded++;
  }
  const supabase = await createClient();
  await supabase.from('import_batches').insert({
    org_id: me.org_id,
    created_by: me.id,
    file_name: fileName.slice(0, 200),
    total: rows.length,
    succeeded: result.succeeded,
    failed: result.failed.length,
    errors: result.failed,
  });
  revalidatePath('/admin/trainees');
  return result;
}

export async function updateTrainee(id: string, f: FormData) {
  await requirePerm('manage_trainees');
  const back = (k: 'error' | 'message', m: string) => redirect(`/admin/trainees/${id}?${k}=${encodeURIComponent(m)}`);
  // 連絡先の閲覧権限がない人のフォームには、メール・電話の欄がない
  const withContact = f.has('email');
  const p = parse(f, withContact);
  if ('error' in p) back('error', p.error!);
  const v = p.data!;
  const supabase = await createClient();

  const { error: e1 } = await supabase.from('profiles').update({ full_name: v.full_name, full_name_kana: v.full_name_kana }).eq('id', id);
  if (e1) back('error', '保存できませんでした：' + e1.message);

  const { data: current } = await supabase.from('trainee_details').select('email').eq('profile_id', id).maybeSingle();
  if (withContact && current && current.email !== v.email) {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(id, { email: v.email, email_confirm: true });
    if (error) back('error', 'メールアドレスを変更できませんでした：' + error.message);
  }
  const { error: e2 } = await supabase.from('trainee_details').update({
    ...(withContact ? { email: v.email, phone: v.phone } : {}),
    enrolled_on: v.enrolled_on || null,
    expected_completion_on: v.expected_completion_on || null,
    updated_at: new Date().toISOString(),
  }).eq('profile_id', id);
  if (e2) back('error', '保存できませんでした：' + e2.message);

  // 所属の変更：今の所属を終了し、新しい所属を追加（履歴が残る）
  const { data: enr } = await supabase.from('enrollments').select('id, class_id').eq('trainee_id', id).is('ended_on', null).maybeSingle();
  if ((enr?.class_id ?? '') !== v.class_id) {
    if (enr) await supabase.from('enrollments').update({ ended_on: today() }).eq('id', enr.id);
    if (v.class_id) {
      const { data: prof } = await supabase.from('profiles').select('org_id').eq('id', id).single();
      const { error } = await supabase.from('enrollments').insert({ org_id: prof!.org_id, trainee_id: id, class_id: v.class_id, started_on: today() });
      if (error) back('error', '所属を変更できませんでした：' + error.message);
    }
  }
  revalidatePath(`/admin/trainees/${id}`);
  back('message', '保存しました');
}

export async function setTraineeSuspended(id: string, suspended: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { data: p } = await supabase.from('profiles').select('status').eq('id', id).single();
  const next = suspended ? 'suspended' : 'active';
  const { error } = await supabase.from('profiles').update({ status: next }).eq('id', id);
  if (error) redirect(`/admin/trainees/${id}?error=` + encodeURIComponent(error.message));
  // ログインそのものも止める（ログイン中の端末も次の通信で切れる）
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(id, { ban_duration: suspended ? '876000h' : 'none' });
  if (!suspended && p?.status === 'suspended') {
    // 一度もパスワードを設定していない人は「招待中」に戻す
    const { data: u } = await admin.auth.admin.getUserById(id);
    if (!u.user?.last_sign_in_at) await supabase.from('profiles').update({ status: 'invited' }).eq('id', id);
  }
  revalidatePath(`/admin/trainees/${id}`);
  redirect(`/admin/trainees/${id}?message=` + encodeURIComponent(suspended ? '利用を停止しました' : '利用を再開しました'));
}

export type InviteResult = { url: string; qr: string; expiresAt: string } | { error: string } | null;

async function issueInviteCore(me: Me, traineeId: string): Promise<{ url: string; qr: string; expiresAt: string; name: string } | { error: string }> {
  const supabase = await createClient();
  // 権限ルールで見えない＝担当外の人には発行させない
  const { data: target } = await supabase.from('profiles').select('id, status, role, full_name').eq('id', traineeId).maybeSingle();
  if (!target) return { error: 'この人に招待を発行する権限がありません' };
  if (target.role !== 'trainee' && me.role !== 'admin') return { error: 'スタッフの招待は管理者のみ発行できます' };
  if (target.status === 'suspended') return { error: '利用停止中のため発行できません。先に利用を再開してください' };

  const admin = createAdminClient();
  const now = new Date();
  await admin.from('invitations').update({ revoked_at: now.toISOString() }).eq('profile_id', traineeId).is('used_at', null).is('revoked_at', null);
  const { token, hash } = newInviteToken();
  const expiresAt = new Date(now.getTime() + INVITE_DAYS * 86400000).toISOString();
  const { error } = await admin.from('invitations').insert({ org_id: me.org_id, profile_id: traineeId, token_hash: hash, expires_at: expiresAt, created_by: me.id });
  if (error) return { error: '発行できませんでした：' + error.message };

  const url = `${env.siteUrl()}/invite/${token}`;
  const qr = await QRCode.toDataURL(url, { width: 320, margin: 1 });
  return { url, qr, expiresAt, name: target.full_name };
}

/** 招待URLを発行（以前の未使用URLは無効になる）。URLはこの画面でのみ表示し、保存しない */
export async function issueInvite(traineeId: string): Promise<InviteResult> {
  const me = await requirePerm('manage_trainees');
  const r = await issueInviteCore(me, traineeId);
  if ('error' in r) return r;
  return { url: r.url, qr: r.qr, expiresAt: r.expiresAt };
}

export type BulkInviteResult = { cards: { id: string; name: string; url: string; qr: string; expiresAt: string }[]; errors: string[] } | null;

/** 選んだ訓練生の招待をまとめて発行（印刷用） */
export async function issueInvites(_prev: BulkInviteResult, f: FormData): Promise<BulkInviteResult> {
  const me = await requirePerm('manage_trainees');
  const ids = f.getAll('id').map(String).slice(0, 200);
  const out: NonNullable<BulkInviteResult> = { cards: [], errors: [] };
  for (const id of ids) {
    const r = await issueInviteCore(me, id);
    if ('error' in r) out.errors.push(r.error);
    else out.cards.push({ id, ...r });
  }
  return out;
}
