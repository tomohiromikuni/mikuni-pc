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
