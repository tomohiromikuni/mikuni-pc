// 出欠・アンケートのテスト：対象者だけが回答でき、集計が正しいこと
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, sudo, as, setupWorld } from './fixtures.mjs';

let W, sid, q1, q2, opts;
before(async () => {
  W = await setupWorld('srv');
  await sudo("insert into staff_permissions values ($1,'survey')", [W.U.staff1]);
  // 1組にもう1人
  const [{ id }] = await sudo("insert into auth.users (email) values ('z-srv@example.com') returning id");
  await sudo("insert into profiles (id, org_id, role, status, full_name, terms_agreed_at) values ($1,$2,'trainee','active','訓練 ゼット', now())", [id, W.orgA]);
  await sudo('insert into enrollments (org_id, trainee_id, class_id) values ($1,$2,$3)', [W.orgA, id, W.class1]);
  W.U.z = id;
});
after(() => pool.end());

test('出欠を作成して配信：1組の有効な訓練生だけが対象', async () => {
  const { U, orgA, class1, class2 } = W;
  [{ id: sid }] = await as(U.staff1, "insert into surveys (org_id, kind, title, due_at, created_by) values ($1,'attendance','明日の出欠', now() + interval '1 day', $2) returning id", [orgA, U.staff1]);
  [{ id: q1 }] = await as(U.staff1, "insert into survey_questions (survey_id, position, kind, label) values ($1,1,'single','明日の出欠') returning id", [sid]);
  opts = {};
  for (const [i, l] of ['出席', '欠席', '遅刻'].entries()) {
    const [{ id }] = await as(U.staff1, 'insert into survey_options (question_id, position, label) values ($1,$2,$3) returning id', [q1, i, l]);
    opts[l] = id;
  }
  [{ id: q2 }] = await as(U.staff1, "insert into survey_questions (survey_id, position, kind, label, required) values ($1,2,'text','連絡事項',false) returning id", [sid]);
  await assert.rejects(as(U.staff1, "insert into survey_targets (survey_id, target_type, class_id) values ($1,'class',$2)", [sid, class2]), /row-level security/);
  await as(U.staff1, "insert into survey_targets (survey_id, target_type, class_id) values ($1,'class',$2)", [sid, class1]);

  // 下書きの間は訓練生に見えない
  assert.equal((await as(U.x, 'select * from surveys')).length, 0);
  // 直接「公開」に書き換えることはできない
  await assert.rejects(as(U.staff1, "update surveys set status = 'published' where id = $1", [sid]), /配信は/);

  const [{ publish_survey: n }] = await as(U.staff1, 'select publish_survey($1)', [sid]);
  assert.equal(n, 2); // X と Z（停止中は除く）
  assert.equal((await as(U.x, 'select * from surveys where id = $1', [sid])).length, 1);
  assert.equal((await as(U.y, 'select * from surveys where id = $1', [sid])).length, 0);
  const [{ my_pending_surveys: p }] = await as(U.x, 'select my_pending_surveys()');
  assert.equal(p, 1);
  // 配信後は質問を変えられない
  await assert.rejects(as(U.staff1, "insert into survey_options (question_id, position, label) values ($1, 9, '早退')", [q1]), /row-level security/);
});

test('回答：選択肢の検証、必須チェック、修正、対象外は回答不可', async () => {
  const { U } = W;
  const ans = (opt, text) => JSON.stringify([{ question_id: q1, option_ids: opt ? [opt] : [] }, { question_id: q2, text }]);
  await assert.rejects(as(U.x, 'select submit_survey_response($1, $2)', [sid, ans(null, '')]), /を選んでください/);
  await assert.rejects(as(U.x, 'select submit_survey_response($1, $2)', [sid, JSON.stringify([{ question_id: q1, option_ids: [opts['出席'], opts['欠席']] }])]), /1つだけ/);
  await assert.rejects(as(U.x, 'select submit_survey_response($1, $2)', [sid, JSON.stringify([{ question_id: q1, option_ids: [q2] }])]), /選択肢が正しくありません/);
  await as(U.x, 'select submit_survey_response($1, $2)', [sid, ans(opts['欠席'], '通院のため')]);
  await as(U.x, 'select submit_survey_response($1, $2)', [sid, ans(opts['遅刻'], '10時に着きます')]); // 修正
  await as(U.z, 'select submit_survey_response($1, $2)', [sid, ans(opts['出席'], '')]);
  await assert.rejects(as(U.y, 'select submit_survey_response($1, $2)', [sid, ans(opts['出席'], '')]), /回答できません/);
  await assert.rejects(as(U.susp, 'select submit_survey_response($1, $2)', [sid, ans(opts['出席'], '')]), /回答できません/);
});

test('集計：回答数・選択肢ごとの人数が正しい。他人の回答は訓練生には見えない', async () => {
  const { U } = W;
  const rows = await as(U.staff1, `
    select o.label, count(a.*)::int as n from survey_options o
    left join survey_answers a on a.option_id = o.id
    where o.question_id = $1 group by o.label, o.position order by o.position`, [q1]);
  assert.deepEqual(rows, [{ label: '出席', n: 1 }, { label: '欠席', n: 0 }, { label: '遅刻', n: 1 }]);
  const texts = await as(U.staff1, 'select text_value from survey_answers where question_id = $1', [q2]);
  assert.deepEqual(texts.map((t) => t.text_value), ['10時に着きます']);
  const responded = await as(U.staff1, 'select count(*)::int as n from survey_recipients where survey_id = $1 and responded_at is not null', [sid]);
  assert.equal(responded[0].n, 2);

  // 訓練生Xには自分の回答しか見えない
  assert.equal((await as(U.x, 'select * from survey_responses')).length, 1);
  assert.equal((await as(U.x, 'select * from survey_answers')).length, 2);
  // 権限のないスタッフには回答が見えない
  assert.equal((await as(U.staffNone, 'select * from survey_answers')).length, 0);
});

test('期限切れ・締切後は回答できない', async () => {
  const { U } = W;
  await sudo("update surveys set due_at = now() - interval '1 minute' where id = $1", [sid]);
  await assert.rejects(as(U.x, 'select submit_survey_response($1, $2)', [sid, JSON.stringify([{ question_id: q1, option_ids: [W.U && opts['出席']] }])]), /期限/);
  const [{ close_due_surveys: n }] = await sudo('select close_due_surveys()');
  assert.equal(n, 1);
  const [{ my_pending_surveys: p }] = await as(U.x, 'select my_pending_surveys()');
  assert.equal(p, 0);
});

test('スタッフが設定値などを細工しても、下書きを直接「公開」にはできない', async () => {
  const { U, orgA } = W;
  const [{ id }] = await as(U.staff1, "insert into surveys (org_id, kind, title, created_by) values ($1,'survey','抜け道',$2) returning id", [orgA, U.staff1]);
  await assert.rejects(
    as(U.staff1, "with s as (select set_config('app.survey_system_update','on',true)) update surveys set status = 'published' from s where id = $1", [id]),
    /配信は/,
  );
  const [row] = await sudo('select status from surveys where id = $1', [id]);
  assert.equal(row.status, 'draft');
});

test('一覧の目印：今月の欠席・遅刻数は担当範囲の訓練生だけ、訓練生は使えない', async () => {
  const { U } = W;
  const rows = await as(U.staff1, 'select * from trainee_overview()');
  const x = rows.find((r) => r.trainee_id === U.x);
  assert.ok(x);
  assert.equal(x.late_month, 1); // 遅刻で回答済み（前のテスト）
  assert.ok(!rows.some((r) => r.trainee_id === U.y)); // 担当外
  assert.equal((await as(U.x, 'select * from trainee_overview()')).length, 0);
});
