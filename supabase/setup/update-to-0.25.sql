-- スタッフの役割を「管理者」と「メンバー」の2つにする。
-- メンバー（role = 'staff'）は、削除など管理者だけの操作以外はすべてできる：
-- すべての権限・すべての期を担当にする。

-- 既存のメンバーに、すべての権限と全体の担当範囲を付ける
insert into public.staff_permissions (staff_id, permission)
select p.id, perm
from public.profiles p
cross join unnest(enum_range(null::public.staff_permission)) as perm
where p.role = 'staff'
on conflict do nothing;

delete from public.staff_scopes s
using public.profiles p
where p.id = s.staff_id and p.role = 'staff' and (s.course_id is not null or s.class_id is not null);

insert into public.staff_scopes (staff_id)
select p.id from public.profiles p
where p.role = 'staff'
  and not exists (select 1 from public.staff_scopes s where s.staff_id = p.id and s.course_id is null and s.class_id is null);

-- 通知しない日（祝日・休校日）：メンバーも追加・変更できる。削除は管理者だけ
drop policy if exists calendar_write on public.calendar_days;
drop policy if exists calendar_admin on public.calendar_days;
drop policy if exists calendar_staff_insert on public.calendar_days;
drop policy if exists calendar_staff_update on public.calendar_days;
create policy calendar_admin on public.calendar_days for all
  using (org_id = public.my_org() and public.is_admin())
  with check (org_id = public.my_org() and public.is_admin());
create policy calendar_staff_insert on public.calendar_days for insert
  with check (org_id = public.my_org() and public.is_staff());
create policy calendar_staff_update on public.calendar_days for update
  using (org_id = public.my_org() and public.is_staff())
  with check (org_id = public.my_org() and public.is_staff());
