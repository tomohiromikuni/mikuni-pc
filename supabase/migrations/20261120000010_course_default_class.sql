-- =====================================================================
-- クラスを使わない運用：各期に「目に見えないクラス」を1つだけ持たせる
--   画面では期だけを扱い、所属・登録受付・宛先はこのクラスを通して記録する。
-- =====================================================================

-- クラスがない期に、自動のクラス（名前「全体」）を作る
insert into public.classes (org_id, course_id, name)
select c.org_id, c.id, '全体'
from public.courses c
where not exists (select 1 from public.classes k where k.course_id = c.id and not k.archived);
