-- 最初の管理者を登録する（Supabase の SQL Editor で1回だけ実行）
-- 手順1：Authentication > Users > 「Add user」で、管理者のメールアドレスとパスワードを作成
--        （「Auto Confirm User」にチェック）
-- 手順2：下の ★ の3か所を書き換えて「Run」
with org as (
  insert into public.organizations (name) values ('★学校名（例：○○職業訓練校）') returning id
), cats as (
  insert into public.announcement_categories (org_id, name, sort_order)
  select org.id, t.name, t.ord from org,
    unnest(array['授業', '事務手続き', '就職支援', 'イベント', 'その他']) with ordinality as t(name, ord)
)
insert into public.profiles (id, org_id, role, status, full_name, terms_agreed_at)
select u.id, org.id, 'admin', 'active', '★管理者の氏名', now()
from auth.users u, org
where u.email = '★管理者のメールアドレス';
