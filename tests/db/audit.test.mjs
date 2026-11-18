// 操作ログ・自動停止・管理者の保護のテスト
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, sudo, as, setupWorld } from './fixtures.mjs';

let W;
before(async () => { W = await setupWorld('aud'); });
after(() => pool.end());

test('操作ログは管理者だけが見られ、記録者を偽れない', async () => {
  const { U } = W;
  await as(U.staffAll, "select log_action('trainee.view', 'profile', $1)", [U.x]);
  await as(U.x, "select log_action('偽の記録')"); // 訓練生からは記録されない
  const logs = await as(U.admin, "select actor_id, action from audit_logs where action in ('trainee.view', '偽の記録')");
  assert.deepEqual(logs, [{ actor_id: U.staffAll, action: 'trainee.view' }]);
  assert.equal((await as(U.staffAll, 'select * from audit_logs')).length, 0);
  assert.equal((await as(U.adminB, 'select * from audit_logs')).length, 0); // 他校の管理者
  await assert.rejects(as(U.admin, "insert into audit_logs (org_id, action) values ($1, 'x')", [W.orgA]), /permission denied/);
});

test('利用停止・権限変更は自動で記録される', async () => {
  const { U } = W;
  await as(U.admin, "update profiles set status = 'suspended' where id = $1", [U.y]);
  await as(U.admin, "insert into staff_permissions values ($1, 'chat')", [U.staff1]);
  const actions = (await as(U.admin, 'select action from audit_logs')).map((r) => r.action);
  assert.ok(actions.includes('profile.change'));
  assert.ok(actions.includes('staff_permissions.insert'));
  await sudo("update profiles set status = 'active' where id = $1", [U.y]);
});

test('最後の管理者は降格・停止できない', async () => {
  const { U } = W;
  await assert.rejects(as(U.admin, "update profiles set role = 'staff' where id = $1", [U.admin]), /管理者が1人もいなくなる/);
  await as(U.admin, "update profiles set role = 'admin' where id = $1", [U.staffAll]);
  await as(U.admin, "update profiles set role = 'staff' where id = $1", [U.staffAll]); // 2人いれば戻せる
});

test('修了予定日の90日後に自動停止（89日目はそのまま）', async () => {
  const { U } = W;
  await sudo("update trainee_details set expected_completion_on = (now() at time zone 'Asia/Tokyo')::date - 91 where profile_id = $1", [U.x]);
  await sudo("update trainee_details set expected_completion_on = (now() at time zone 'Asia/Tokyo')::date - 89 where profile_id = $1", [U.y]);
  const [{ suspend_completed_trainees: n }] = await sudo('select suspend_completed_trainees()');
  assert.equal(n, 1);
  const rows = await sudo('select id, status from profiles where id = any($1)', [[U.x, U.y]]);
  assert.equal(rows.find((r) => r.id === U.x).status, 'suspended');
  assert.equal(rows.find((r) => r.id === U.y).status, 'active');
  assert.ok((await sudo("select * from audit_logs where action = 'trainee.auto_suspend' and target_id = $1", [U.x])).length === 1);
});
