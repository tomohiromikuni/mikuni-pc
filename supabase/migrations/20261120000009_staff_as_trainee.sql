-- =====================================================================
-- 運営メンバー（管理者・スタッフ）が「訓練生としても参加」できるようにする
--   also_trainee = true の人は、訓練生と同じようにお知らせ・出欠が届き、
--   事務局チャットも使える。1つのログインで「管理画面」と「訓練生モード」を切り替える。
-- =====================================================================

alter table public.profiles add column also_trainee boolean not null default false;
create index on public.profiles (org_id) where also_trainee;

-- 担当範囲の判定：訓練生として参加している運営メンバーも対象
create or replace function public.can_access_trainee(p_trainee_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles t
    where t.id = p_trainee_id and (t.role = 'trainee' or t.also_trainee) and t.org_id = public.my_org()
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

-- お知らせの配信先
create or replace function public.materialize_announcement(p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  insert into public.announcement_recipients (announcement_id, trainee_id)
  select distinct p_id, p.id
  from public.announcements a
  join public.announcement_targets t on t.announcement_id = a.id
  join public.profiles p on p.org_id = a.org_id and (p.role = 'trainee' or p.also_trainee) and p.status <> 'suspended'
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

-- 出欠・アンケートの配信先
create or replace function public.publish_survey(p_id uuid) returns int
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
  join public.profiles p on p.org_id = s.org_id and (p.role = 'trainee' or p.also_trainee) and p.status <> 'suspended'
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

-- 自分の事務局チャット
create or replace function public.ensure_my_chat_room() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  m public.profiles := public.me();
  rid uuid;
begin
  if m.id is null or not (m.role = 'trainee' or m.also_trainee) then raise exception '訓練生のみ利用できます'; end if;
  insert into public.chat_rooms (org_id, trainee_id) values (m.org_id, m.id)
    on conflict (trainee_id) do nothing;
  select id into rid from public.chat_rooms where trainee_id = m.id;
  return rid;
end $$;

-- チャットの送信者の判定
create or replace function public.on_chat_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sender_role public.user_role;
begin
  -- その部屋の訓練生本人が送ったかどうかで判定（運営メンバーが訓練生として送った場合も「訓練生側」）
  select case when r.trainee_id = new.sender_id then 'trainee'::public.user_role else p.role end
    into sender_role
    from public.chat_rooms r, public.profiles p
   where r.id = new.room_id and p.id = new.sender_id;
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

-- チャットの通知先（訓練生本人の送信 → 担当の運営メンバーへ。自分自身には送らない）
create or replace function public.enqueue_chat_notification() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r public.chat_rooms;
  sender public.profiles;
  preview text := coalesce(nullif(left(new.body, 60), ''), '（ファイル）');
begin
  select * into r from public.chat_rooms where id = new.room_id;
  select * into sender from public.profiles where id = new.sender_id;
  if new.sender_id = r.trainee_id then
    insert into public.notification_queue (org_id, user_id, kind, title, body, url)
    select r.org_id, p.id, 'chat', sender.full_name || 'さんからメッセージ', preview, '/admin/chat/' || r.id
    from public.profiles p
    where p.org_id = r.org_id and p.status = 'active' and p.role in ('admin', 'staff') and p.id <> new.sender_id
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

create or replace function public.push_coverage() returns table (trainees int, with_push int)
language sql stable security definer set search_path = public as $$
  select count(*)::int, count(*) filter (where exists (select 1 from public.push_subscriptions s where s.user_id = p.id))::int
  from public.profiles p
  where p.org_id = public.my_org() and (p.role = 'trainee' or p.also_trainee) and p.status = 'active' and public.is_staff()
    and public.can_access_trainee(p.id)
$$;

create or replace function public.trainee_overview()
returns table (trainee_id uuid, has_push boolean, absent_month int, late_month int)
language sql stable security definer set search_path = public as $$
  with month_start as (
    select date_trunc('month', now() at time zone 'Asia/Tokyo')::date as d
  )
  select p.id,
         exists (select 1 from public.push_subscriptions s where s.user_id = p.id),
         count(*) filter (where o.label = '欠席')::int,
         count(*) filter (where o.label = '遅刻')::int
  from public.profiles p
  left join public.survey_responses r on r.trainee_id = p.id
  left join public.surveys sv on sv.id = r.survey_id and sv.kind = 'attendance'
    and coalesce(sv.target_date, (sv.published_at at time zone 'Asia/Tokyo')::date) >= (select d from month_start)
  left join public.survey_answers a on a.response_id = r.id and sv.id is not null
  left join public.survey_options o on o.id = a.option_id
  where p.org_id = public.my_org() and (p.role = 'trainee' or p.also_trainee) and public.is_staff() and public.can_access_trainee(p.id)
  group by p.id
$$;

-- 役割・利用状態・訓練生としての参加の変更は管理者のみ
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- サーバー管理処理（service_role）
  if (new.role, new.status, new.org_id, new.also_trainee) is distinct from (old.role, old.status, old.org_id, old.also_trainee)
     and not public.is_admin() then
    raise exception '役割・利用状態の変更は管理者のみ可能です';
  end if;
  if new.terms_agreed_at is distinct from old.terms_agreed_at and new.id <> auth.uid() then
    raise exception '規約同意は本人のみ記録できます';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- 権限（作り直した関数にも同じ権限を付け直す）
revoke execute on function public.materialize_announcement(uuid), public.enqueue_chat_notification(), public.on_chat_message() from public, anon, authenticated;
grant execute on function public.can_access_trainee(uuid), public.publish_survey(uuid), public.ensure_my_chat_room(),
  public.push_coverage(), public.trainee_overview(), public.guard_profile_update() to authenticated;
grant execute on all functions in schema public to service_role;
