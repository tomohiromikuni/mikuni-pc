// 最初の管理者を作るスクリプト
// 使い方: node --env-file=.env.local scripts/create-admin.mjs "組織名" "氏名" メールアドレス パスワード
import { createClient } from '@supabase/supabase-js';

const [orgName, fullName, email, password] = process.argv.slice(2);
if (!orgName || !fullName || !email || !password || password.length < 12) {
  console.error('使い方: node --env-file=.env.local scripts/create-admin.mjs "組織名" "氏名" メールアドレス パスワード(12文字以上)');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('.env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const fail = (msg, e) => {
  console.error(msg, e?.message ?? '');
  process.exit(1);
};

let { data: org } = await db.from('organizations').select('id').eq('name', orgName).maybeSingle();
if (!org) {
  const r = await db.from('organizations').insert({ name: orgName }).select('id').single();
  if (r.error) fail('組織を作成できませんでした', r.error);
  org = r.data;
  const cats = ['授業', '事務手続き', '就職支援', 'イベント', 'その他'];
  await db.from('announcement_categories').insert(cats.map((name, i) => ({ org_id: org.id, name, sort_order: i })));
  console.log(`組織「${orgName}」を作成しました`);
}

const { data: u, error: ue } = await db.auth.admin.createUser({ email, password, email_confirm: true });
if (ue) fail('ログインアカウントを作成できませんでした', ue);
const { error: pe } = await db.from('profiles').insert({ id: u.user.id, org_id: org.id, role: 'admin', status: 'active', full_name: fullName });
if (pe) {
  await db.auth.admin.deleteUser(u.user.id);
  fail('管理者を登録できませんでした', pe);
}
console.log(`管理者「${fullName}」（${email}）を作成しました。ログイン画面からログインしてください。`);
