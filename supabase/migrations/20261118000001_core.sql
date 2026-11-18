-- =====================================================================
-- 段階0〜1：基本の表と権限ルール（RLS）
--   組織 / 利用者 / 訓練生情報 / スタッフ権限 / コース・クラス / 所属
--   招待 / お知らせ（宛先・配信先・既読）
-- 方針：画面側ではなく、データベース自体が「見てよい行」を決める。
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- 種類（選択肢） ----------
create type public.user_role as enum ('admin', 'staff', 'trainee');
create type public.account_status as enum ('invited', 'active', 'suspended');
create type public.staff_permission as enum (
  'view_pii',         -- 訓練生の連絡先（メール・電話）を見る
  'manage_trainees',  -- 訓練生の登録・編集・所属変更・招待
  'announce',         -- お知らせの作成・配信
  'chat',             -- 個別チャットの閲覧・返信（段階3）
  'survey'            -- アンケート・出欠の作成・集計（段階4）
);
create type public.announcement_priority as enum ('normal', 'important', 'urgent');
create type public.announcement_status as enum ('draft', 'scheduled', 'published');
create type public.target_type as enum ('all', 'course', 'class');

-- ---------- 組織（将来の複数校対応） ----------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- ---------- 利用者（ログインする人すべて） ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id),
  role public.user_role not null,
  status public.account_status not null default 'invited',
  full_name text not null,
  full_name_kana text not null default '',
  terms_agreed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.profiles (org_id, role);

-- ---------- 訓練生の連絡先・日付（個人情報。閲覧は権限が必要） ----------
create table public.trainee_details (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  email text not null,
  phone text not null default '',
  enrolled_on date,             -- 入校日（コース開始日）
  expected_completion_on date,  -- 修了予定日
  updated_at timestamptz not null default now()
);

-- ---------- コース・クラス ----------
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  name text not null,
  starts_on date,
  ends_on date,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  course_id uuid not null references public.courses(id),
  name text not null,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.classes (course_id);

-- 所属（履歴を残す。ended_on が空の行が「現在の所属」）
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  trainee_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid not null references public.classes(id),
  started_on date not null default current_date,
  ended_on date,
  created_at timestamptz not null default now()
);
create unique index enrollments_one_current on public.enrollments (trainee_id) where ended_on is null;
create index on public.enrollments (class_id) where ended_on is null;

-- ---------- スタッフの担当範囲・権限 ----------
-- course_id も class_id も空 = 全体を担当
create table public.staff_scopes (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade
);
create index on public.staff_scopes (staff_id);

create table public.staff_permissions (
  staff_id uuid not null references public.profiles(id) on delete cascade,
  permission public.staff_permission not null,
  primary key (staff_id, permission)
);

-- ---------- 招待 ----------
-- コードそのものは保存せず、ハッシュ値だけを保存する（漏れても使えない）
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index on public.invitations (profile_id);

-- ---------- お知らせ ----------
create table public.announcement_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  name text not null,
  sort_order int not null default 0
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '',
  category_id uuid references public.announcement_categories(id),
  priority public.announcement_priority not null default 'normal',
  status public.announcement_status not null default 'draft',
  publish_at timestamptz,       -- 予約日時（予約のとき）
  published_at timestamptz,     -- 実際に配信された日時
  edited_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index on public.announcements (org_id, status, published_at desc);

create table public.announcement_targets (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  target_type public.target_type not null,
  course_id uuid references public.courses(id),
  class_id uuid references public.classes(id),
  check (
    (target_type = 'all' and course_id is null and class_id is null) or
    (target_type = 'course' and course_id is not null and class_id is null) or
    (target_type = 'class' and class_id is not null and course_id is null)
  )
);
create index on public.announcement_targets (announcement_id);

-- 配信先（配信した時点の対象者を固定して記録）＋既読
create table public.announcement_recipients (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  trainee_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz,
  primary key (announcement_id, trainee_id)
);
create index on public.announcement_recipients (trainee_id);

-- =====================================================================
-- 権限判定の関数
-- （security definer = 関数の中だけは表を直接見られる。RLSの無限ループを防ぐ）
-- =====================================================================

-- ログイン中で、かつ「有効」な本人のプロフィール
create function public.me() returns public.profiles
language sql stable security definer set search_path = public as $$
  select p.* from public.profiles p where p.id = auth.uid() and p.status = 'active'
$$;

create function public.my_org() returns uuid
language sql stable security definer set search_path = public as $$
  select (public.me()).org_id
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((public.me()).role = 'admin', false)
$$;

create function public.is_staff() returns boolean   -- 管理者 または スタッフ
language sql stable security definer set search_path = public as $$
  select coalesce((public.me()).role in ('admin', 'staff'), false)
$$;

create function public.has_perm(perm public.staff_permission) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (
    coalesce((public.me()).role = 'staff', false) and exists (
      select 1 from public.staff_permissions sp
      where sp.staff_id = auth.uid() and sp.permission = perm
    )
  )
$$;

-- そのクラスは自分の担当範囲か
create function public.can_access_class(p_class_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (
    coalesce((public.me()).role = 'staff', false) and exists (
      select 1
      from public.staff_scopes s
      join public.classes c on c.id = p_class_id and c.org_id = public.my_org()
      where s.staff_id = auth.uid()
        and (
          (s.course_id is null and s.class_id is null)
          or s.class_id = c.id
          or s.course_id = c.course_id
        )
    )
  )
$$;

create function public.can_access_course(p_course_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (
    coalesce((public.me()).role = 'staff', false) and exists (
      select 1
      from public.staff_scopes s
      join public.courses c on c.id = p_course_id and c.org_id = public.my_org()
      where s.staff_id = auth.uid()
        and ((s.course_id is null and s.class_id is null) or s.course_id = c.id)
    )
  )
$$;

create function public.has_full_scope() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.staff_scopes s
    where s.staff_id = auth.uid() and s.course_id is null and s.class_id is null
      and coalesce((public.me()).role = 'staff', false)
  )
$$;

-- その訓練生は自分の担当範囲か（現在の所属クラスで判定。未所属は全体担当のみ）
create function public.can_access_trainee(p_trainee_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles t
    where t.id = p_trainee_id and t.role = 'trainee' and t.org_id = public.my_org()
      and (
        public.has_full_scope()
        or exists (
          select 1 from public.enrollments e
          where e.trainee_id = t.id and e.ended_on is null
            and public.can_access_class(e.class_id)
        )
      )
  )
$$;

-- 現在どこかのクラスに所属しているか（未所属の新規訓練生をスタッフが所属させるため）
create function public.has_current_enrollment(p_trainee_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.enrollments e where e.trainee_id = p_trainee_id and e.ended_on is null)
$$;

-- 対象（全体/コース/クラス）に配信してよいか
create function public.can_target(t public.target_type, p_course_id uuid, p_class_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case t
    when 'all' then public.has_full_scope()
    when 'course' then public.can_access_course(p_course_id)
    when 'class' then public.can_access_class(p_class_id)
  end
$$;

-- =====================================================================
-- 行単位のアクセス制御（RLS）
-- =====================================================================
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.trainee_details enable row level security;
alter table public.courses enable row level security;
alter table public.classes enable row level security;
alter table public.enrollments enable row level security;
alter table public.staff_scopes enable row level security;
alter table public.staff_permissions enable row level security;
alter table public.invitations enable row level security;
alter table public.announcement_categories enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_targets enable row level security;
alter table public.announcement_recipients enable row level security;

-- 組織：自分の組織だけ見える。変更は管理者
create policy org_read on public.organizations for select using (id = public.my_org());
create policy org_update on public.organizations for update using (id = public.my_org() and public.is_admin());

-- 利用者
--   本人：自分の行（利用停止中でも「停止中」と表示するために自分の行だけは読める）
--   訓練生：管理者・スタッフの名前は見える（チャット相手の表示用）。他の訓練生は見えない
--   スタッフ：担当範囲の訓練生
create policy profiles_read on public.profiles for select using (
  id = auth.uid()
  or (org_id = public.my_org() and role in ('admin', 'staff'))
  or (public.is_staff() and public.can_access_trainee(id))
);
create policy profiles_insert on public.profiles for insert with check (
  org_id = public.my_org() and (
    public.is_admin() or (role = 'trainee' and public.has_perm('manage_trainees'))
  )
);
create policy profiles_update on public.profiles for update using (
  public.is_admin() or (public.has_perm('manage_trainees') and public.can_access_trainee(id))
);

-- 役割・状態・組織の変更は管理者のみ（スタッフが自分を管理者にする等を防ぐ）
create function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- サーバー管理処理（service_role）
  if (new.role, new.status, new.org_id) is distinct from (old.role, old.status, old.org_id)
     and not public.is_admin() then
    raise exception '役割・利用状態の変更は管理者のみ可能です';
  end if;
  if new.terms_agreed_at is distinct from old.terms_agreed_at and new.id <> auth.uid() then
    raise exception '規約同意は本人のみ記録できます';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- 訓練生の連絡先：本人、または「連絡先閲覧」権限＋担当範囲
create policy trainee_details_read on public.trainee_details for select using (
  profile_id = (public.me()).id
  or (public.has_perm('view_pii') and public.can_access_trainee(profile_id))
);
create policy trainee_details_write on public.trainee_details for all using (
  public.has_perm('manage_trainees') and public.can_access_trainee(profile_id)
) with check (
  public.has_perm('manage_trainees') and public.can_access_trainee(profile_id)
);

-- コース・クラス：組織内は閲覧可、変更は管理者
create policy courses_read on public.courses for select using (org_id = public.my_org());
create policy courses_write on public.courses for all using (org_id = public.my_org() and public.is_admin())
  with check (org_id = public.my_org() and public.is_admin());
create policy classes_read on public.classes for select using (org_id = public.my_org());
create policy classes_write on public.classes for all using (org_id = public.my_org() and public.is_admin())
  with check (org_id = public.my_org() and public.is_admin());

-- 所属：本人、担当スタッフ。変更は訓練生管理権限＋担当範囲（移動先クラスも担当範囲内）
create policy enrollments_read on public.enrollments for select using (
  trainee_id = (public.me()).id or (public.is_staff() and public.can_access_trainee(trainee_id))
);
create policy enrollments_insert on public.enrollments for insert with check (
  org_id = public.my_org() and public.has_perm('manage_trainees')
  and public.can_access_class(class_id)
  and (public.has_full_scope() or public.can_access_trainee(trainee_id)
       or not public.has_current_enrollment(trainee_id))
);
create policy enrollments_update on public.enrollments for update using (
  public.has_perm('manage_trainees') and public.can_access_trainee(trainee_id)
);

-- スタッフ権限・担当範囲：本人は自分の分を見られる。設定は管理者のみ
create policy staff_scopes_read on public.staff_scopes for select using (staff_id = auth.uid() or public.is_admin());
create policy staff_scopes_write on public.staff_scopes for all using (public.is_admin()) with check (public.is_admin());
create policy staff_perms_read on public.staff_permissions for select using (staff_id = auth.uid() or public.is_admin());
create policy staff_perms_write on public.staff_permissions for all using (public.is_admin()) with check (public.is_admin());

-- 招待：状態の閲覧のみ（発行・使用はサーバーの管理処理で行う）
create policy invitations_read on public.invitations for select using (
  public.has_perm('manage_trainees') and (public.is_admin() or public.can_access_trainee(profile_id))
);

-- お知らせカテゴリー
create policy categories_read on public.announcement_categories for select using (org_id = public.my_org());
create policy categories_write on public.announcement_categories for all using (org_id = public.my_org() and public.is_admin())
  with check (org_id = public.my_org() and public.is_admin());

-- お知らせ本体
--   訓練生：自分が配信先に含まれる「配信済み」のものだけ
--   スタッフ：配信権限があれば組織内のもの
create policy announcements_read on public.announcements for select using (
  (org_id = public.my_org() and public.has_perm('announce'))
  or (status = 'published' and exists (
        select 1 from public.announcement_recipients r
        where r.announcement_id = announcements.id and r.trainee_id = auth.uid()))
);
create policy announcements_insert on public.announcements for insert with check (
  org_id = public.my_org() and public.has_perm('announce') and created_by = auth.uid()
);
create policy announcements_update on public.announcements for update using (
  org_id = public.my_org() and (public.is_admin() or (public.has_perm('announce') and created_by = auth.uid()))
);
create policy announcements_delete on public.announcements for delete using (
  org_id = public.my_org() and public.is_admin()
);

create policy targets_read on public.announcement_targets for select using (
  exists (select 1 from public.announcements a where a.id = announcement_id and a.org_id = public.my_org())
  and public.has_perm('announce')
);
create policy targets_write on public.announcement_targets for all using (
  public.has_perm('announce') and exists (
    select 1 from public.announcements a where a.id = announcement_id and a.org_id = public.my_org()
      and a.status <> 'published' and (public.is_admin() or a.created_by = auth.uid()))
) with check (
  public.has_perm('announce') and public.can_target(target_type, course_id, class_id)
  and exists (
    select 1 from public.announcements a where a.id = announcement_id and a.org_id = public.my_org()
      and a.status <> 'published' and (public.is_admin() or a.created_by = auth.uid()))
);

-- 配信先・既読：訓練生は自分の行、スタッフは担当範囲の訓練生の行
-- （作成は配信関数のみ、既読の記録は mark_announcement_read のみ）
create policy recipients_read on public.announcement_recipients for select using (
  trainee_id = auth.uid()
  or (public.has_perm('announce') and public.can_access_trainee(trainee_id))
);

-- =====================================================================
-- お知らせの配信処理
-- =====================================================================

-- 宛先から配信先（訓練生）を確定して「配信済み」にする
create function public.materialize_announcement(p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  insert into public.announcement_recipients (announcement_id, trainee_id)
  select distinct p_id, p.id
  from public.announcements a
  join public.announcement_targets t on t.announcement_id = a.id
  join public.profiles p on p.org_id = a.org_id and p.role = 'trainee' and p.status <> 'suspended'
  left join public.enrollments e on e.trainee_id = p.id and e.ended_on is null
  left join public.classes c on c.id = e.class_id
  where a.id = p_id
    and (
      t.target_type = 'all'
      or (t.target_type = 'course' and c.course_id = t.course_id)
      or (t.target_type = 'class' and e.class_id = t.class_id)
    )
  on conflict do nothing;
  get diagnostics n = row_count;

  update public.announcements
     set status = 'published', published_at = coalesce(published_at, now())
   where id = p_id;
  return n;
end $$;
revoke all on function public.materialize_announcement(uuid) from public;

-- 画面から呼ぶ「今すぐ配信 / 予約」
create function public.publish_announcement(p_id uuid, p_publish_at timestamptz default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  a public.announcements;
begin
  select * into a from public.announcements where id = p_id;
  if a.id is null or a.org_id <> public.my_org() then raise exception 'お知らせが見つかりません'; end if;
  if not (public.is_admin() or (public.has_perm('announce') and a.created_by = auth.uid())) then
    raise exception '配信する権限がありません';
  end if;
  if a.status = 'published' then raise exception 'すでに配信済みです'; end if;
  if not exists (select 1 from public.announcement_targets where announcement_id = p_id) then
    raise exception '宛先を選んでください';
  end if;
  if exists (select 1 from public.announcement_targets t where t.announcement_id = p_id
             and not public.can_target(t.target_type, t.course_id, t.class_id)) then
    raise exception '担当範囲外の宛先が含まれています';
  end if;

  if p_publish_at is not null and p_publish_at > now() then
    update public.announcements set status = 'scheduled', publish_at = p_publish_at where id = p_id;
    return 0;
  end if;
  return public.materialize_announcement(p_id);
end $$;

-- 予約時刻を過ぎたお知らせを配信する（定期実行から呼ぶ）
create function public.publish_due_announcements() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  total int := 0;
begin
  for r in select id from public.announcements
           where status = 'scheduled' and publish_at <= now()
           for update skip locked
  loop
    perform public.materialize_announcement(r.id);
    total := total + 1;
  end loop;
  return total;
end $$;
revoke all on function public.publish_due_announcements() from public;

-- 既読の記録（本人の行だけ）
create function public.mark_announcement_read(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.announcement_recipients
     set read_at = now()
   where announcement_id = p_id and trainee_id = auth.uid() and read_at is null
     and (public.me()).id is not null
$$;

-- 規約への同意（本人）
create function public.agree_terms() returns void
language sql security definer set search_path = public as $$
  update public.profiles set terms_agreed_at = now()
   where id = auth.uid() and terms_agreed_at is null
$$;

-- =====================================================================
-- 権限（ログイン前の利用者には何も見せない）
-- =====================================================================
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.me(), public.my_org(), public.is_admin(), public.is_staff(),
  public.has_perm(public.staff_permission), public.can_access_class(uuid), public.can_access_course(uuid),
  public.can_access_trainee(uuid), public.has_full_scope(), public.has_current_enrollment(uuid),
  public.can_target(public.target_type, uuid, uuid), public.publish_announcement(uuid, timestamptz),
  public.mark_announcement_read(uuid), public.agree_terms(), public.guard_profile_update()
  to authenticated;
grant execute on all functions in schema public to service_role;
