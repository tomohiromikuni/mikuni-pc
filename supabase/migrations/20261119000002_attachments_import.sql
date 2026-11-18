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
