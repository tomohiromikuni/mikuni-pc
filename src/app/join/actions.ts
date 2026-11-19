'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { normalizePhone, phoneToLoginEmail } from '@/lib/phone';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const schema = z.object({
  class_id: z.uuid('何期生かを選んでください'),
  full_name: z.string().trim().min(1, '氏名を入力してください').max(100),
  full_name_kana: z.string().trim().min(1, 'フリガナを入力してください').max(100),
  phone: z.string().trim(),
  password: z.string().min(8, 'パスワードは8文字以上にしてください').max(72),
  confirm: z.string(),
  agree: z.literal('on', { error: '利用規約に同意してください' }),
});

/** 受付中のクラス一覧（ログイン前なので管理用クライアントで取得。名前だけを返す） */
export async function listOpenClasses() {
  const db = createAdminClient();
  const { data } = await db
    .from('classes')
    .select('id, name, course_id, courses!inner(name, starts_on, archived)')
    .eq('open_for_signup', true)
    .eq('archived', false)
    .eq('courses.archived', false)
    .order('created_at');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((k: any) => ({ id: k.id as string, name: k.name as string, courseId: k.course_id as string, courseName: k.courses.name as string }));
}

/** 共通QRからの自己登録：アカウントを作って、そのままログインする */
export async function selfRegister(formData: FormData) {
  const back = (msg: string) => redirect('/join?error=' + encodeURIComponent(msg));
  // ロボット対策（人には見えない欄に入力があれば無視）
  if (String(formData.get('website') ?? '')) back('登録できませんでした');

  const parsed = schema.safeParse(Object.fromEntries(['class_id', 'full_name', 'full_name_kana', 'phone', 'password', 'confirm', 'agree'].map((k) => [k, formData.get(k) ?? ''])));
  if (!parsed.success) back(parsed.error.issues[0].message);
  const v = parsed.data!;
  if (v.password !== v.confirm) back('確認用のパスワードが一致しません');
  const phone = normalizePhone(v.phone);
  if (!phone) back('携帯番号を正しく入力してください（例：090-1234-5678）');

  const db = createAdminClient();
  // 受付中のクラスか（画面を細工されても受付外には登録させない）
  const { data: cls } = await db.from('classes').select('id, org_id, open_for_signup, archived, courses(archived)').eq('id', v.class_id).maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!cls || !cls.open_for_signup || cls.archived || (cls as any).courses?.archived) back('この期は現在登録を受け付けていません');

  const { data: dup } = await db.from('trainee_details').select('profile_id').eq('phone', phone!).maybeSingle();
  if (dup) {
    // 名簿で先に登録されている人：氏名が一致すれば、そのアカウントで使い始められるようにする
    const { data: prof } = await db.from('profiles').select('id, org_id, status, full_name, full_name_kana').eq('id', dup.profile_id).single();
    if (!prof || prof.status !== 'invited') back('この携帯番号はすでに登録されています。ログイン画面からログインしてください（パスワードを忘れた場合は事務局へ）');
    const norm = (x: string) => x.normalize('NFKC').replace(/\s/g, '');
    if (norm(prof!.full_name) !== norm(v.full_name)) back('事務局の名簿と氏名が一致しません。名簿に登録されている氏名で入力するか、事務局にお問い合わせください');
    const { data: u } = await db.auth.admin.getUserById(prof!.id);
    const loginEmail = u.user?.email ?? phoneToLoginEmail(phone!);
    const { error: pwErr } = await db.auth.admin.updateUserById(prof!.id, { password: v.password, email_confirm: true });
    if (pwErr) back('登録できませんでした（' + pwErr.message + '）。事務局にお問い合わせください');
    await db
      .from('profiles')
      .update({ status: 'active', terms_agreed_at: new Date().toISOString(), ...(prof!.full_name_kana ? {} : { full_name_kana: v.full_name_kana }) })
      .eq('id', prof!.id);
    await db.from('invitations').update({ revoked_at: new Date().toISOString() }).eq('profile_id', prof!.id).is('used_at', null).is('revoked_at', null);
    await db.from('audit_logs').insert({ org_id: prof!.org_id, actor_id: prof!.id, action: 'trainee.self_register', target_type: 'profile', target_id: prof!.id, detail: { name: prof!.full_name, roster: true } });
    const supabase = await createClient();
    await supabase.auth.signInWithPassword({ email: loginEmail, password: v.password });
    redirect('/home');
  }

  const loginEmail = phoneToLoginEmail(phone!);
  const { data: created, error } = await db.auth.admin.createUser({ email: loginEmail, password: v.password, email_confirm: true });
  if (error || !created.user) {
    console.error('self-register createUser failed', error);
    back(
      /already|registered|exists/i.test(error?.message ?? '')
        ? 'この携帯番号はすでに登録されています。ログインしてください'
        : `登録できませんでした（${(error as { code?: string })?.code ?? error?.message ?? '不明'}）。事務局にこの画面を見せてください`,
    );
  }
  const id = created.user!.id;
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
  const steps = [
    () => db.from('profiles').insert({ id, org_id: cls!.org_id, role: 'trainee', status: 'active', full_name: v.full_name, full_name_kana: v.full_name_kana, terms_agreed_at: new Date().toISOString() }),
    () => db.from('trainee_details').insert({ profile_id: id, email: null, phone: phone! }),
    () => db.from('enrollments').insert({ org_id: cls!.org_id, trainee_id: id, class_id: cls!.id, started_on: today }),
  ];
  for (const step of steps) {
    const { error: e } = await step();
    if (e) {
      await db.auth.admin.deleteUser(id);
      back(e.code === '23505' ? 'この携帯番号はすでに登録されています' : '登録できませんでした：' + e.message);
    }
  }
  await db.from('audit_logs').insert({ org_id: cls!.org_id, actor_id: id, action: 'trainee.self_register', target_type: 'profile', target_id: id, detail: { name: v.full_name } });

  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email: loginEmail, password: v.password });
  redirect('/home');
}
