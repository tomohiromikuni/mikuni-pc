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
