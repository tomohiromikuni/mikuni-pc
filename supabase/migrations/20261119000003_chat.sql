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
