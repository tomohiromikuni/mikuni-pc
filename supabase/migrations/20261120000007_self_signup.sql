-- =====================================================================
-- 共通QRからの自己登録（メールアドレスなし・携帯番号でログイン）
-- =====================================================================

-- クラスごとの「登録受付中」スイッチ（オンのクラスだけが登録画面に出る）
alter table public.classes add column open_for_signup boolean not null default false;

-- メールアドレスは任意に
alter table public.trainee_details alter column email drop not null;

-- 同じ携帯番号では二重に登録できない（数字だけで比較）
create unique index trainee_details_phone_unique
  on public.trainee_details ((regexp_replace(phone, '\D', '', 'g')))
  where phone <> '';
