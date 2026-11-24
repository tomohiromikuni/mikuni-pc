-- =====================================================================
-- 受講番号（「27期生の5番」）でログイン・登録できるようにする
--   期の番号：courses.cohort_no（同じ学校の中で重複なし）
--   出席番号：enrollments.seat_no（同じ期の中で重複なし）
-- 携帯番号・メールアドレスは任意（今までどおり携帯番号でもログインできる）
-- =====================================================================

alter table public.courses add column if not exists cohort_no integer check (cohort_no between 1 and 9999);
create unique index if not exists courses_cohort_no_unique on public.courses (org_id, cohort_no) where cohort_no is not null;

alter table public.enrollments add column if not exists seat_no integer check (seat_no between 1 and 999);
create unique index if not exists enrollments_seat_unique on public.enrollments (class_id, seat_no) where ended_on is null and seat_no is not null;

-- 期の名前が「27期」「第27期」のように番号で始まっていれば、期の番号に入れておく（あとで変更できる）
-- （「2027年1月期」のような名前には入れない）
update public.courses c
set cohort_no = (regexp_match(c.name, '^\s*第?\s*(\d+)\s*期'))[1]::int
where c.cohort_no is null
  and c.name ~ '^\s*第?\s*\d+\s*期'
  and (regexp_match(c.name, '^\s*第?\s*(\d+)\s*期'))[1]::int between 1 and 9999
  and not exists (
    select 1 from public.courses o
    where o.org_id = c.org_id and o.id <> c.id
      and (o.cohort_no = (regexp_match(c.name, '^\s*第?\s*(\d+)\s*期'))[1]::int
           or (o.name ~ '^\s*第?\s*\d+\s*期' and (regexp_match(o.name, '^\s*第?\s*(\d+)\s*期'))[1] = (regexp_match(c.name, '^\s*第?\s*(\d+)\s*期'))[1]))
  );
