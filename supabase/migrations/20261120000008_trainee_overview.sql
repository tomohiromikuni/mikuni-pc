-- =====================================================================
-- 管理画面「訓練生」一覧の目印用：通知の設定状況と、今月の欠席・遅刻数
-- （担当範囲の訓練生だけを返す）
-- =====================================================================
create function public.trainee_overview()
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
  where p.org_id = public.my_org() and p.role = 'trainee' and public.is_staff() and public.can_access_trainee(p.id)
  group by p.id
$$;
revoke execute on function public.trainee_overview() from public, anon;
grant execute on function public.trainee_overview() to authenticated, service_role;
