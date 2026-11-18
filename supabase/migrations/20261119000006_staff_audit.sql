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
