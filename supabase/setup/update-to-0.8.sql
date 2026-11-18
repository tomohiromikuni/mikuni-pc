-- =====================================================================
-- バージョン 0.8 までの追加設定（まとめて1回で実行）
-- core（最初に実行したもの）の後に、SQL Editor へ全部貼り付けて Run してください。
-- 途中でエラーが出た場合は、何も変更されずに元のままになります（安全です）。
-- =====================================================================
begin;

-- ---------- 20261119000002_attachments_import.sql ----------
-- =====================================================================
-- 段階2：添付ファイル（画像・PDF）と一括登録の記録
-- =====================================================================

create type public.attachment_kind as enum ('announcement', 'chat');

-- 添付ファイルの情報（ファイル本体は Storage の非公開バケットに保存）
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  kind public.attachment_kind not null,
  announcement_id uuid references public.announcements(id) on delete cascade,
  message_id uuid,  -- 段階3でチャットのメッセージと結びつける
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null,
  size_bytes int not null check (size_bytes between 1 and 10485760),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  check (
    (kind = 'announcement' and announcement_id is not null and storage_path like 'announcements/' || announcement_id || '/%')
    or (kind = 'chat' and message_id is not null)
  )
);
create index on public.attachments (announcement_id);
create index on public.attachments (message_id);

-- そのお知らせを編集してよいか（管理者、または配信権限があり自分が作成者）
create function public.can_edit_announcement(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.announcements a
    where a.id = p_id and a.org_id = public.my_org()
      and (public.is_admin() or (public.has_perm('announce') and a.created_by = auth.uid()))
  )
$$;

-- そのチャットに投稿してよいか（段階3で中身を定義。ここでは「不可」）
create function public.can_post_chat_room(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$ select false $$;

-- Storage にアップロード・削除してよい場所か
--   announcements/<お知らせID>/...  … そのお知らせを編集できる人
--   chat/<ルームID>/...             … そのチャットに参加できる人
create function public.can_write_object(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  parts text[] := string_to_array(p_name, '/');
begin
  if array_length(parts, 1) <> 3 then return false; end if;
  if parts[1] = 'announcements' then return public.can_edit_announcement(parts[2]::uuid); end if;
  if parts[1] = 'chat' then return public.can_post_chat_room(parts[2]::uuid); end if;
  return false;
exception when invalid_text_representation then
  return false;
end $$;

alter table public.attachments enable row level security;

-- 見られるのは「そのお知らせが見える人」だけ（お知らせ側の権限ルールがそのまま効く）
create policy attachments_read on public.attachments for select using (
  org_id = public.my_org() and (
    (kind = 'announcement' and exists (select 1 from public.announcements a where a.id = announcement_id))
  )
);
create policy attachments_insert on public.attachments for insert with check (
  org_id = public.my_org() and created_by = auth.uid() and public.can_write_object(storage_path)
);
create policy attachments_delete on public.attachments for delete using (
  org_id = public.my_org() and public.can_write_object(storage_path)
);

-- ---------- Storage（ファイル本体） ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 10485760, array[
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword', 'application/vnd.ms-excel', 'text/plain', 'text/csv'
])
on conflict (id) do nothing;

create policy "attachments: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.can_write_object(name));
create policy "attachments: read" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and exists (
    select 1 from public.attachments a where a.storage_path = storage.objects.name));
create policy "attachments: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and public.can_write_object(name));

-- ---------- 一括登録の記録 ----------
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  created_by uuid not null default auth.uid() references public.profiles(id),
  file_name text not null default '',
  total int not null default 0,
  succeeded int not null default 0,
  failed int not null default 0,
  errors jsonb not null default '[]',
  created_at timestamptz not null default now()
);
alter table public.import_batches enable row level security;
create policy import_batches_read on public.import_batches for select using (
  org_id = public.my_org() and public.has_perm('manage_trainees')
);
create policy import_batches_insert on public.import_batches for insert with check (
  org_id = public.my_org() and public.has_perm('manage_trainees') and created_by = auth.uid()
);

-- ---------- 権限 ----------
revoke all on public.attachments, public.import_batches from anon;
grant select, insert, delete on public.attachments to authenticated;
grant select, insert on public.import_batches to authenticated;
revoke execute on function public.can_edit_announcement(uuid), public.can_post_chat_room(uuid),
  public.can_write_object(text) from public, anon;
grant execute on function public.can_edit_announcement(uuid), public.can_post_chat_room(uuid),
  public.can_write_object(text) to authenticated, service_role;

-- ---------- 20261119000003_chat.sql ----------
-- =====================================================================
-- 段階3：事務局チャット（訓練生 ⇔ 事務局 の1対1）
--   訓練生から見た相手は「事務局」1つ。
--   中身を見られるのは、本人と「チャット」権限＋担当範囲のスタッフだけ。
-- =====================================================================

create type public.chat_status as enum ('open', 'in_progress', 'done');  -- 未対応 / 対応中 / 完了

create table public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  trainee_id uuid not null unique references public.profiles(id) on delete cascade,
  status public.chat_status not null default 'open',
  last_message_at timestamptz,
  last_sender_role public.user_role,
  created_at timestamptz not null default now()
);
create index on public.chat_rooms (org_id, last_message_at desc);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles(id),
  body text not null default '' check (char_length(body) <= 4000),
  created_at timestamptz not null default now()
);
create index on public.chat_messages (room_id, created_at);

-- 誰がどこまで読んだか（訓練生側に「既読」を表示するため、本人も見られる）
create table public.chat_reads (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- スタッフ向けメモ（訓練生には見えない）
create table public.chat_notes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index on public.chat_notes (room_id, created_at);

-- 添付ファイルをメッセージと結びつける
alter table public.attachments
  add constraint attachments_message_id_fkey foreign key (message_id) references public.chat_messages(id) on delete cascade;
alter table public.attachments add constraint attachments_chat_path check (
  kind <> 'chat' or storage_path like 'chat/%'
);

-- ---------- 権限判定 ----------
create function public.can_view_chat_room(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.chat_rooms r
    where r.id = p_room and r.org_id = public.my_org()
      and (
        r.trainee_id = (public.me()).id
        or (public.has_perm('chat') and public.can_access_trainee(r.trainee_id))
      )
  )
$$;

-- 段階2で仮に「不可」としていた関数を置き換える
create or replace function public.can_post_chat_room(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_view_chat_room(p_room)
$$;

-- 訓練生：自分のチャットルーム（なければ作る）
create function public.ensure_my_chat_room() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  m public.profiles := public.me();
  rid uuid;
begin
  if m.id is null or m.role <> 'trainee' then raise exception '訓練生のみ利用できます'; end if;
  insert into public.chat_rooms (org_id, trainee_id) values (m.org_id, m.id)
    on conflict (trainee_id) do nothing;
  select id into rid from public.chat_rooms where trainee_id = m.id;
  return rid;
end $$;

-- スタッフ：訓練生とのチャットルーム（なければ作る）
create function public.ensure_chat_room(p_trainee uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
begin
  if not (public.has_perm('chat') and public.can_access_trainee(p_trainee)) then
    raise exception 'この訓練生とのチャットを開く権限がありません';
  end if;
  insert into public.chat_rooms (org_id, trainee_id) values (public.my_org(), p_trainee)
    on conflict (trainee_id) do nothing;
  select id into rid from public.chat_rooms where trainee_id = p_trainee;
  return rid;
end $$;

-- 既読の記録
create function public.mark_chat_read(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_view_chat_room(p_room) then return; end if;
  insert into public.chat_reads (room_id, user_id, last_read_at) values (p_room, auth.uid(), now())
    on conflict (room_id, user_id) do update set last_read_at = excluded.last_read_at;
end $$;

-- 訓練生：未読メッセージ数
create function public.my_chat_unread() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int
  from public.chat_rooms r
  join public.chat_messages m on m.room_id = r.id and m.sender_id <> r.trainee_id
  left join public.chat_reads cr on cr.room_id = r.id and cr.user_id = r.trainee_id
  where r.trainee_id = (public.me()).id
    and (cr.last_read_at is null or m.created_at > cr.last_read_at)
$$;

-- メッセージが届いたら：ルームの最終更新、送信者は既読、訓練生から届いたら「完了」を「未対応」に戻す
create function public.on_chat_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sender_role public.user_role;
begin
  select role into sender_role from public.profiles where id = new.sender_id;
  update public.chat_rooms
     set last_message_at = new.created_at,
         last_sender_role = sender_role,
         status = case when sender_role = 'trainee' and status = 'done' then 'open'::public.chat_status
                       when sender_role <> 'trainee' and status = 'open' then 'in_progress'::public.chat_status
                       else status end
   where id = new.room_id;
  insert into public.chat_reads (room_id, user_id, last_read_at) values (new.room_id, new.sender_id, new.created_at)
    on conflict (room_id, user_id) do update set last_read_at = greatest(chat_reads.last_read_at, excluded.last_read_at);
  return new;
end $$;
create trigger chat_message_after_insert after insert on public.chat_messages
  for each row execute function public.on_chat_message();

-- ---------- 行単位のアクセス制御 ----------
alter table public.chat_rooms enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reads enable row level security;
alter table public.chat_notes enable row level security;

create policy chat_rooms_read on public.chat_rooms for select using (public.can_view_chat_room(id));
create policy chat_rooms_update on public.chat_rooms for update using (
  public.has_perm('chat') and public.can_access_trainee(trainee_id)
);

create policy chat_messages_read on public.chat_messages for select using (public.can_view_chat_room(room_id));
create policy chat_messages_insert on public.chat_messages for insert with check (
  sender_id = auth.uid() and org_id = public.my_org() and public.can_post_chat_room(room_id)
);

create policy chat_reads_read on public.chat_reads for select using (public.can_view_chat_room(room_id));

create policy chat_notes_read on public.chat_notes for select using (
  public.has_perm('chat') and exists (select 1 from public.chat_rooms r where r.id = room_id and public.can_access_trainee(r.trainee_id))
);
create policy chat_notes_insert on public.chat_notes for insert with check (
  author_id = auth.uid() and public.has_perm('chat')
  and exists (select 1 from public.chat_rooms r where r.id = room_id and public.can_access_trainee(r.trainee_id))
);

-- 添付：お知らせに加え、チャットの添付は「そのメッセージが見える人」
drop policy attachments_read on public.attachments;
create policy attachments_read on public.attachments for select using (
  org_id = public.my_org() and (
    (kind = 'announcement' and exists (select 1 from public.announcements a where a.id = announcement_id))
    or (kind = 'chat' and exists (select 1 from public.chat_messages m where m.id = message_id))
  )
);

-- ---------- 即時表示（Realtime）：権限ルールに従って配信される ----------
alter publication supabase_realtime add table public.chat_messages, public.chat_reads;

-- ---------- 権限 ----------
revoke all on public.chat_rooms, public.chat_messages, public.chat_reads, public.chat_notes from anon;
grant select, update on public.chat_rooms to authenticated;
grant select, insert on public.chat_messages, public.chat_notes to authenticated;
grant select on public.chat_reads to authenticated;
revoke execute on function public.can_view_chat_room(uuid), public.ensure_my_chat_room(), public.ensure_chat_room(uuid),
  public.mark_chat_read(uuid), public.my_chat_unread(), public.on_chat_message() from public, anon;
grant execute on function public.can_view_chat_room(uuid), public.can_post_chat_room(uuid), public.ensure_my_chat_room(),
  public.ensure_chat_room(uuid), public.mark_chat_read(uuid), public.my_chat_unread() to authenticated;
grant execute on all functions in schema public to service_role;

-- ---------- 20261119000004_surveys.sql ----------
-- =====================================================================
-- 段階4：出欠確認・アンケート
--   出欠 = 「出席 / 欠席 / 遅刻」の選択式1問＋連絡事項（任意）のアンケート
--   回答は記名式。誰が未回答かを管理者が確認できる。
-- =====================================================================

create type public.survey_kind as enum ('attendance', 'survey');
create type public.survey_status as enum ('draft', 'published', 'closed');
create type public.question_kind as enum ('single', 'multi', 'text');

create table public.surveys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  kind public.survey_kind not null,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  target_date date,              -- 出欠の対象日
  due_at timestamptz,            -- 回答期限
  status public.survey_status not null default 'draft',
  published_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index on public.surveys (org_id, status, published_at desc);

create table public.survey_targets (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  target_type public.target_type not null,
  course_id uuid references public.courses(id),
  class_id uuid references public.classes(id),
  check (
    (target_type = 'all' and course_id is null and class_id is null) or
    (target_type = 'course' and course_id is not null and class_id is null) or
    (target_type = 'class' and class_id is not null and course_id is null)
  )
);

create table public.survey_questions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  position int not null,
  kind public.question_kind not null,
  label text not null check (char_length(label) between 1 and 500),
  required boolean not null default true
);
create index on public.survey_questions (survey_id, position);

create table public.survey_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.survey_questions(id) on delete cascade,
  position int not null,
  label text not null check (char_length(label) between 1 and 200)
);
create index on public.survey_options (question_id, position);

-- 配信先（配信時点で固定）。未回答者一覧の元データ
create table public.survey_recipients (
  survey_id uuid not null references public.surveys(id) on delete cascade,
  trainee_id uuid not null references public.profiles(id) on delete cascade,
  responded_at timestamptz,
  primary key (survey_id, trainee_id)
);
create index on public.survey_recipients (trainee_id);

create table public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  trainee_id uuid not null references public.profiles(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (survey_id, trainee_id)
);

create table public.survey_answers (
  response_id uuid not null references public.survey_responses(id) on delete cascade,
  question_id uuid not null references public.survey_questions(id) on delete cascade,
  option_id uuid references public.survey_options(id) on delete cascade,
  text_value text check (char_length(text_value) <= 2000),
  check (option_id is not null or text_value is not null)
);
create index on public.survey_answers (response_id);
create index on public.survey_answers (question_id);

-- ---------- 権限判定 ----------
create function public.can_edit_survey(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.surveys s
    where s.id = p_id and s.org_id = public.my_org() and s.status = 'draft'
      and (public.is_admin() or (public.has_perm('survey') and s.created_by = auth.uid()))
  )
$$;

create function public.is_survey_recipient(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.survey_recipients r join public.surveys s on s.id = r.survey_id
    where r.survey_id = p_id and r.trainee_id = (public.me()).id and s.status <> 'draft'
  )
$$;

-- ---------- 行単位のアクセス制御 ----------
alter table public.surveys enable row level security;
alter table public.survey_targets enable row level security;
alter table public.survey_questions enable row level security;
alter table public.survey_options enable row level security;
alter table public.survey_recipients enable row level security;
alter table public.survey_responses enable row level security;
alter table public.survey_answers enable row level security;

create policy surveys_read on public.surveys for select using (
  (org_id = public.my_org() and public.has_perm('survey')) or public.is_survey_recipient(id)
);
create policy surveys_insert on public.surveys for insert with check (
  org_id = public.my_org() and public.has_perm('survey') and created_by = auth.uid() and status = 'draft'
);
create policy surveys_update on public.surveys for update using (
  org_id = public.my_org() and (public.is_admin() or (public.has_perm('survey') and created_by = auth.uid()))
);
create policy surveys_delete on public.surveys for delete using (org_id = public.my_org() and public.is_admin());

-- 状態の変更は「下書き→公開」は配信関数のみ、「公開→締切/再開」は作成者・管理者
-- ※ security invoker：更新した人の立場で動く。利用者が直接更新すると current_user は authenticated、
--   配信関数（security definer）の中からの更新では関数の所有者になるので、利用者には偽れない
create function public.guard_survey_update() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if old.status = 'draft' and new.status <> 'draft' then
    raise exception '配信は「配信する」ボタンから行ってください';
  end if;
  if old.status <> 'draft' and new.status = 'draft' then
    raise exception '配信済みのものは下書きに戻せません';
  end if;
  if old.status <> 'draft' and (new.kind, new.org_id) is distinct from (old.kind, old.org_id) then
    raise exception '配信後は種類を変更できません';
  end if;
  return new;
end $$;
create trigger surveys_guard before update on public.surveys for each row execute function public.guard_survey_update();

create policy survey_targets_read on public.survey_targets for select using (
  public.has_perm('survey') and exists (select 1 from public.surveys s where s.id = survey_id and s.org_id = public.my_org())
);
create policy survey_targets_write on public.survey_targets for all using (public.can_edit_survey(survey_id))
  with check (public.can_edit_survey(survey_id) and public.can_target(target_type, course_id, class_id));

create policy survey_questions_read on public.survey_questions for select using (
  exists (select 1 from public.surveys s where s.id = survey_id)
);
create policy survey_questions_write on public.survey_questions for all using (public.can_edit_survey(survey_id))
  with check (public.can_edit_survey(survey_id));

create policy survey_options_read on public.survey_options for select using (
  exists (select 1 from public.survey_questions q where q.id = question_id)
);
create policy survey_options_write on public.survey_options for all using (
  exists (select 1 from public.survey_questions q where q.id = question_id and public.can_edit_survey(q.survey_id))
) with check (
  exists (select 1 from public.survey_questions q where q.id = question_id and public.can_edit_survey(q.survey_id))
);

-- 配信先・回答：訓練生は自分の分、スタッフは「アンケート」権限＋担当範囲の訓練生の分
create policy survey_recipients_read on public.survey_recipients for select using (
  trainee_id = (public.me()).id or (public.has_perm('survey') and public.can_access_trainee(trainee_id))
);
create policy survey_responses_read on public.survey_responses for select using (
  trainee_id = (public.me()).id or (public.has_perm('survey') and public.can_access_trainee(trainee_id))
);
create policy survey_answers_read on public.survey_answers for select using (
  exists (select 1 from public.survey_responses r where r.id = response_id)
);

-- ---------- 配信・回答の処理 ----------
create function public.publish_survey(p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  s public.surveys;
  n int;
begin
  select * into s from public.surveys where id = p_id;
  if s.id is null or s.org_id <> public.my_org() then raise exception 'アンケートが見つかりません'; end if;
  if not (public.is_admin() or (public.has_perm('survey') and s.created_by = auth.uid())) then raise exception '配信する権限がありません'; end if;
  if s.status <> 'draft' then raise exception 'すでに配信済みです'; end if;
  if not exists (select 1 from public.survey_targets where survey_id = p_id) then raise exception '宛先を選んでください'; end if;
  if not exists (select 1 from public.survey_questions where survey_id = p_id) then raise exception '質問を1つ以上作ってください'; end if;
  if exists (select 1 from public.survey_questions q where q.survey_id = p_id and q.kind <> 'text'
             and not exists (select 1 from public.survey_options o where o.question_id = q.id)) then
    raise exception '選択式の質問に選択肢がありません';
  end if;
  if exists (select 1 from public.survey_targets t where t.survey_id = p_id
             and not public.can_target(t.target_type, t.course_id, t.class_id)) then
    raise exception '担当範囲外の宛先が含まれています';
  end if;

  insert into public.survey_recipients (survey_id, trainee_id)
  select distinct p_id, p.id
  from public.survey_targets t
  join public.profiles p on p.org_id = s.org_id and p.role = 'trainee' and p.status <> 'suspended'
  left join public.enrollments e on e.trainee_id = p.id and e.ended_on is null
  left join public.classes c on c.id = e.class_id
  where t.survey_id = p_id
    and (t.target_type = 'all'
      or (t.target_type = 'course' and c.course_id = t.course_id)
      or (t.target_type = 'class' and e.class_id = t.class_id))
  on conflict do nothing;
  get diagnostics n = row_count;

  update public.surveys set status = 'published', published_at = now() where id = p_id;
  return n;
end $$;

-- 回答（期限内なら何度でも修正できる）
--   p_answers: [{"question_id": "...", "option_ids": ["..."], "text": "..."}]
create function public.submit_survey_response(p_survey uuid, p_answers jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.surveys;
  me_id uuid := (public.me()).id;
  rid uuid;
  q record;
  a jsonb;
  opt text;
  n int;
begin
  select * into s from public.surveys where id = p_survey;
  if s.id is null or not public.is_survey_recipient(p_survey) then raise exception 'このアンケートには回答できません'; end if;
  if s.status <> 'published' then raise exception '受付は終了しました'; end if;
  if s.due_at is not null and s.due_at < now() then raise exception '回答期限を過ぎています'; end if;

  insert into public.survey_responses (survey_id, trainee_id) values (p_survey, me_id)
    on conflict (survey_id, trainee_id) do update set updated_at = now()
    returning id into rid;
  delete from public.survey_answers where response_id = rid;

  for q in select * from public.survey_questions where survey_id = p_survey order by position loop
    select elem into a from jsonb_array_elements(p_answers) elem where elem->>'question_id' = q.id::text limit 1;
    if q.kind = 'text' then
      if coalesce(btrim(a->>'text'), '') = '' then
        if q.required then raise exception '「%」に回答してください', q.label; end if;
      else
        insert into public.survey_answers (response_id, question_id, text_value) values (rid, q.id, left(a->>'text', 2000));
      end if;
    else
      n := 0;
      for opt in select jsonb_array_elements_text(coalesce(a->'option_ids', '[]'::jsonb)) loop
        if not exists (select 1 from public.survey_options where id = opt::uuid and question_id = q.id) then
          raise exception '選択肢が正しくありません';
        end if;
        insert into public.survey_answers (response_id, question_id, option_id) values (rid, q.id, opt::uuid);
        n := n + 1;
      end loop;
      if q.kind = 'single' and n > 1 then raise exception '「%」は1つだけ選んでください', q.label; end if;
      if q.required and n = 0 then raise exception '「%」を選んでください', q.label; end if;
    end if;
  end loop;

  update public.survey_recipients set responded_at = now() where survey_id = p_survey and trainee_id = me_id;
end $$;

-- 締切を過ぎたアンケートを「締切」にする（定期実行から呼ぶ）
create function public.close_due_surveys() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.surveys set status = 'closed' where status = 'published' and due_at is not null and due_at < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- 訓練生：未回答の件数
create function public.my_pending_surveys() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.survey_recipients r join public.surveys s on s.id = r.survey_id
  where r.trainee_id = (public.me()).id and r.responded_at is null and s.status = 'published'
    and (s.due_at is null or s.due_at > now())
$$;

-- ---------- 権限 ----------
revoke all on public.surveys, public.survey_targets, public.survey_questions, public.survey_options,
  public.survey_recipients, public.survey_responses, public.survey_answers from anon;
grant select, insert, update, delete on public.surveys, public.survey_targets, public.survey_questions, public.survey_options to authenticated;
grant select on public.survey_recipients, public.survey_responses, public.survey_answers to authenticated;
revoke execute on function public.can_edit_survey(uuid), public.is_survey_recipient(uuid), public.publish_survey(uuid),
  public.submit_survey_response(uuid, jsonb), public.close_due_surveys(), public.my_pending_surveys(),
  public.guard_survey_update() from public, anon;
grant execute on function public.can_edit_survey(uuid), public.is_survey_recipient(uuid), public.publish_survey(uuid),
  public.submit_survey_response(uuid, jsonb), public.my_pending_surveys(), public.guard_survey_update() to authenticated;
grant execute on all functions in schema public to service_role;

-- ---------- 20261119000005_notifications.sql ----------
-- =====================================================================
-- 段階5：プッシュ通知・通知しない時間帯・祝日／休校日
--   お知らせ・チャット・出欠／アンケートが届くと「送信待ち」に積まれ、
--   1分ごとの送信処理が、訓練生の通知禁止時間を考えて送る（止めている間の分は朝にまとめて1通）。
-- =====================================================================

-- 端末ごとの通知の宛先（1人で複数の端末を登録できる）
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);
create index on public.push_subscriptions (user_id);

-- 送信待ちの通知
create table public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('announcement', 'chat', 'survey', 'reminder', 'other')),
  title text not null,
  body text not null default '',
  url text not null default '/',
  ignore_quiet boolean not null default false,  -- 緊急：通知禁止時間でも送る
  send_after timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index notification_queue_due on public.notification_queue (send_after) where sent_at is null;

-- 祝日・休校日
create table public.calendar_days (
  org_id uuid not null references public.organizations(id),
  day date not null,
  kind text not null check (kind in ('holiday', 'closure')),  -- 国民の祝日 / 休校日
  name text not null default '',
  primary key (org_id, day)
);

-- 緊急のお知らせを「時間外でも通知する」（管理者のみ設定可）
alter table public.announcements add column notify_immediately boolean not null default false;

create function public.guard_notify_immediately() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if current_user = 'authenticated' and new.notify_immediately
     and (tg_op = 'INSERT' or not old.notify_immediately) and not public.is_admin() then
    raise exception '時間外の緊急通知は管理者のみ設定できます';
  end if;
  return new;
end $$;
create trigger announcements_notify_guard before insert or update on public.announcements
  for each row execute function public.guard_notify_immediately();

-- ---------- 通知を積む ----------
create function public.enqueue_announcement_notification() returns trigger
language plpgsql security definer set search_path = public as $$
declare a public.announcements;
begin
  select * into a from public.announcements where id = new.announcement_id;
  insert into public.notification_queue (org_id, user_id, kind, title, body, url, ignore_quiet)
  values (a.org_id, new.trainee_id, 'announcement',
          case a.priority when 'urgent' then '【緊急】' when 'important' then '【重要】' else '' end || a.title,
          '新しいお知らせが届きました', '/announcements/' || a.id,
          a.priority = 'urgent' and a.notify_immediately);
  return new;
end $$;
create trigger announcement_recipients_notify after insert on public.announcement_recipients
  for each row execute function public.enqueue_announcement_notification();

create function public.enqueue_survey_notification() returns trigger
language plpgsql security definer set search_path = public as $$
declare s public.surveys;
begin
  select * into s from public.surveys where id = new.survey_id;
  insert into public.notification_queue (org_id, user_id, kind, title, body, url)
  values (s.org_id, new.trainee_id, 'survey',
          case s.kind when 'attendance' then '出欠確認のお願い' else 'アンケートのお願い' end,
          s.title, '/answers/' || s.id);
  return new;
end $$;
create trigger survey_recipients_notify after insert on public.survey_recipients
  for each row execute function public.enqueue_survey_notification();

-- チャット：訓練生から → 担当の管理者・スタッフへ／事務局から → 訓練生へ
create function public.enqueue_chat_notification() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r public.chat_rooms;
  sender public.profiles;
  preview text := coalesce(nullif(left(new.body, 60), ''), '（ファイル）');
begin
  select * into r from public.chat_rooms where id = new.room_id;
  select * into sender from public.profiles where id = new.sender_id;
  if sender.role = 'trainee' then
    insert into public.notification_queue (org_id, user_id, kind, title, body, url)
    select r.org_id, p.id, 'chat', sender.full_name || 'さんからメッセージ', preview, '/admin/chat/' || r.id
    from public.profiles p
    where p.org_id = r.org_id and p.status = 'active' and p.role in ('admin', 'staff')
      and (
        p.role = 'admin'
        or (
          exists (select 1 from public.staff_permissions sp where sp.staff_id = p.id and sp.permission = 'chat')
          and exists (
            select 1 from public.staff_scopes s
            left join public.enrollments e on e.trainee_id = r.trainee_id and e.ended_on is null
            left join public.classes c on c.id = e.class_id
            where s.staff_id = p.id
              and ((s.course_id is null and s.class_id is null) or s.class_id = e.class_id or s.course_id = c.course_id)
          )
        )
      );
  else
    insert into public.notification_queue (org_id, user_id, kind, title, body, url)
    values (r.org_id, r.trainee_id, 'chat', '事務局からメッセージ', preview, '/chat');
  end if;
  return new;
end $$;
create trigger chat_messages_notify after insert on public.chat_messages
  for each row execute function public.enqueue_chat_notification();

-- 再通知：お知らせの未読者へ（担当範囲の訓練生のみ）
create function public.remind_announcement(p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare a public.announcements; n int;
begin
  select * into a from public.announcements where id = p_id;
  if a.id is null or a.org_id <> public.my_org() or not public.has_perm('announce') then raise exception '権限がありません'; end if;
  insert into public.notification_queue (org_id, user_id, kind, title, body, url)
  select a.org_id, r.trainee_id, 'reminder', '【未読】' || a.title, 'まだ読まれていないお知らせがあります', '/announcements/' || a.id
  from public.announcement_recipients r
  where r.announcement_id = p_id and r.read_at is null and public.can_access_trainee(r.trainee_id);
  get diagnostics n = row_count;
  return n;
end $$;

-- 再通知：出欠・アンケートの未回答者へ
create function public.remind_survey(p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare s public.surveys; n int;
begin
  select * into s from public.surveys where id = p_id;
  if s.id is null or s.org_id <> public.my_org() or not public.has_perm('survey') then raise exception '権限がありません'; end if;
  if s.status <> 'published' then raise exception '受付中のものだけ再通知できます'; end if;
  insert into public.notification_queue (org_id, user_id, kind, title, body, url)
  select s.org_id, r.trainee_id, 'reminder', '【未回答】' || s.title, '回答期限までにご回答ください', '/answers/' || s.id
  from public.survey_recipients r
  where r.survey_id = p_id and r.responded_at is null and public.can_access_trainee(r.trainee_id);
  get diagnostics n = row_count;
  return n;
end $$;

-- 管理画面用：通知を受け取れる状態の訓練生の割合
create function public.push_coverage() returns table (trainees int, with_push int)
language sql stable security definer set search_path = public as $$
  select count(*)::int, count(*) filter (where exists (select 1 from public.push_subscriptions s where s.user_id = p.id))::int
  from public.profiles p
  where p.org_id = public.my_org() and p.role = 'trainee' and p.status = 'active' and public.is_staff()
    and public.can_access_trainee(p.id)
$$;

-- ---------- 行単位のアクセス制御 ----------
alter table public.push_subscriptions enable row level security;
alter table public.notification_queue enable row level security;  -- 利用者からは触れない（送信処理のみ）
alter table public.calendar_days enable row level security;

create policy push_subs_own on public.push_subscriptions for all
  using (user_id = (public.me()).id) with check (user_id = (public.me()).id);

create policy calendar_read on public.calendar_days for select using (org_id = public.my_org());
create policy calendar_write on public.calendar_days for all using (org_id = public.my_org() and public.is_admin())
  with check (org_id = public.my_org() and public.is_admin());

revoke all on public.push_subscriptions, public.notification_queue, public.calendar_days from anon;
revoke all on public.notification_queue from authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.calendar_days to authenticated;
revoke execute on function public.enqueue_announcement_notification(), public.enqueue_survey_notification(),
  public.enqueue_chat_notification(), public.remind_announcement(uuid), public.remind_survey(uuid),
  public.push_coverage(), public.guard_notify_immediately() from public, anon;
grant execute on function public.remind_announcement(uuid), public.remind_survey(uuid), public.push_coverage(),
  public.guard_notify_immediately() to authenticated;
grant execute on all functions in schema public to service_role;
grant all on public.notification_queue, public.push_subscriptions, public.calendar_days to service_role;

-- ---------- 20261119000006_staff_audit.sql ----------
-- =====================================================================
-- 段階6：操作ログ、修了後の自動停止、管理者がいなくならないための保護
-- =====================================================================

create table public.audit_logs (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null default '',
  target_id uuid,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.audit_logs (org_id, created_at desc);
create index on public.audit_logs (target_id);

alter table public.audit_logs enable row level security;
create policy audit_read on public.audit_logs for select using (org_id = public.my_org() and public.is_admin());

-- 画面から記録する（記録者は必ず本人）
create function public.log_action(p_action text, p_target_type text default '', p_target_id uuid default null, p_detail jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (org_id, actor_id, action, target_type, target_id, detail)
  select public.my_org(), auth.uid(), left(p_action, 100), left(p_target_type, 50), p_target_id, coalesce(p_detail, '{}')
  where public.is_staff()
$$;

-- 役割・利用状態の変更は自動で記録
create function public.audit_profile_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role or new.status is distinct from old.status then
    insert into public.audit_logs (org_id, actor_id, action, target_type, target_id, detail)
    values (new.org_id, auth.uid(), 'profile.change', 'profile', new.id,
      jsonb_build_object('name', new.full_name, 'role', jsonb_build_array(old.role, new.role), 'status', jsonb_build_array(old.status, new.status)));
  end if;
  return new;
end $$;
create trigger profiles_audit after update on public.profiles for each row execute function public.audit_profile_change();

-- スタッフの権限・担当範囲の変更も自動で記録
create function public.audit_staff_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec record := coalesce(new, old);
  org uuid;
begin
  select org_id into org from public.profiles where id = rec.staff_id;
  insert into public.audit_logs (org_id, actor_id, action, target_type, target_id, detail)
  values (org, auth.uid(), tg_table_name || '.' || lower(tg_op), 'profile', rec.staff_id, to_jsonb(rec));
  return null;
end $$;
create trigger staff_permissions_audit after insert or delete on public.staff_permissions for each row execute function public.audit_staff_change();
create trigger staff_scopes_audit after insert or delete on public.staff_scopes for each row execute function public.audit_staff_change();

-- 最後の管理者を「スタッフ」にしたり停止したりできないようにする
create function public.guard_last_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and old.status = 'active' and (new.role <> 'admin' or new.status <> 'active')
     and not exists (select 1 from public.profiles p where p.org_id = old.org_id and p.role = 'admin' and p.status = 'active' and p.id <> old.id) then
    raise exception '管理者が1人もいなくなるため変更できません。先に別の管理者を追加してください';
  end if;
  return new;
end $$;
create trigger profiles_last_admin before update on public.profiles for each row execute function public.guard_last_admin();

-- 修了予定日の90日後にアカウントを自動停止（毎日実行）
create function public.suspend_completed_trainees(p_days int default 90) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
  today date := (now() at time zone 'Asia/Tokyo')::date;
begin
  with targets as (
    select p.id, p.org_id, p.full_name, d.expected_completion_on
    from public.profiles p join public.trainee_details d on d.profile_id = p.id
    where p.role = 'trainee' and p.status <> 'suspended'
      and d.expected_completion_on is not null and d.expected_completion_on + p_days < today
  ), upd as (
    update public.profiles p set status = 'suspended' from targets t where p.id = t.id returning t.*
  )
  insert into public.audit_logs (org_id, actor_id, action, target_type, target_id, detail)
  select org_id, null, 'trainee.auto_suspend', 'profile', id,
         jsonb_build_object('name', full_name, 'expected_completion_on', expected_completion_on)
  from upd;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;
revoke execute on function public.log_action(text, text, uuid, jsonb), public.audit_profile_change(), public.audit_staff_change(),
  public.guard_last_admin(), public.suspend_completed_trainees(int) from public, anon;
grant execute on function public.log_action(text, text, uuid, jsonb) to authenticated;
grant execute on all functions in schema public to service_role;

-- ---------- 20261120000007_self_signup.sql ----------
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

commit;
