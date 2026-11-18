// 権限（RLS）のテスト：「見えてはいけないものが見えない」ことを確認する
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, sudo, as, setupWorld } from './fixtures.mjs';

let U, orgA, course1, class1, class2, createAnnouncement;
before(async () => {
  ({ U, orgA, course1, class1, class2, createAnnouncement } = await setupWorld('rls'));
});

after(() => pool.end());

const names = (rows) => rows.map((r) => r.full_name).sort();

test('ログイン前は何も見えない', async () => {
  await assert.rejects(as(null, 'select * from profiles'), /permission denied/);
});

test('訓練生：他の訓練生は見えず、スタッフの名前は見える', async () => {
  const rows = await as(U.x, 'select full_name, role from profiles');
  assert.deepEqual(names(rows.filter((r) => r.role === 'trainee')), ['訓練 エックス']);
  assert.ok(rows.some((r) => r.full_name === '管理 太郎'));
  assert.ok(!rows.some((r) => r.full_name === '他校 生徒'));
});

test('訓練生：他人の連絡先は見えない', async () => {
  const rows = await as(U.x, 'select profile_id from trainee_details');
  assert.deepEqual(rows.map((r) => r.profile_id), [U.x]);
});

test('利用停止中の訓練生は、停止中と表示するための自分の行以外は何も見えない', async () => {
  const me = await as(U.susp, 'select id, status from profiles');
  assert.deepEqual(me, [{ id: U.susp, status: 'suspended' }]);
  assert.equal((await as(U.susp, 'select * from trainee_details')).length, 0);
  assert.equal((await as(U.susp, 'select * from enrollments')).length, 0);
  assert.equal((await as(U.susp, 'select * from courses')).length, 0);
  assert.equal((await as(U.susp, 'select * from announcements')).length, 0);
});

test('他校の訓練生にはA校の情報が一切見えない', async () => {
  assert.equal((await as(U.other, 'select * from courses')).length, 0);
  assert.deepEqual(names(await as(U.other, 'select full_name from profiles')), ['他校 生徒', '他校 管理者']);
});

test('担当クラスのスタッフ：担当外の訓練生は見えない', async () => {
  const rows = await as(U.staff1, "select full_name from profiles where role = 'trainee'");
  assert.deepEqual(names(rows), ['停止 中', '訓練 エックス']);
});

test('連絡先閲覧の権限がないスタッフには連絡先が見えない', async () => {
  assert.equal((await as(U.staff1, 'select * from trainee_details')).length, 0);
  assert.equal((await as(U.staffAll, 'select * from trainee_details')).length, 3);
});

test('スタッフは自分を管理者にできない', async () => {
  const r = await as(U.staffAll, "update profiles set role = 'admin' where id = $1 returning id", [U.staffAll]);
  assert.equal(r.length, 0); // 自分の行は更新対象外
  await assert.rejects(
    as(U.staffAll, "update profiles set status = 'suspended' where id = $1", [U.x]),
    /管理者のみ/,
  );
  const ok = await as(U.staffAll, "update profiles set full_name = '訓練 X' where id = $1 returning id", [U.x]);
  assert.equal(ok.length, 1);
  await sudo("update profiles set full_name = '訓練 エックス' where id = $1", [U.x]);
});

test('管理者以外はコースを作れない', async () => {
  await assert.rejects(as(U.staffAll, "insert into courses (org_id, name) values ($1, 'x')", [orgA]), /row-level security/);
});

test('配信権限のないスタッフはお知らせを作れない', async () => {
  await assert.rejects(
    as(U.staffNone, "insert into announcements (org_id, title, created_by) values ($1,'t',$2)", [orgA, U.staffNone]),
    /row-level security/,
  );
});

test('担当外のクラスには配信できない', async () => {
  await assert.rejects(createAnnouncement(U.staff1, '2組あて', [{ type: 'class', class: class2 }]), /row-level security/);
  await assert.rejects(createAnnouncement(U.staff1, '全体あて', [{ type: 'all' }]), /row-level security/);
});

test('クラス配信：対象クラスの訓練生だけに届き、既読が記録される', async () => {
  const id = await createAnnouncement(U.staff1, '1組あて', [{ type: 'class', class: class1 }]);
  // 下書きの間は訓練生に見えない
  assert.equal((await as(U.x, 'select * from announcements where id = $1', [id])).length, 0);

  const [{ publish_announcement: n }] = await as(U.staff1, 'select publish_announcement($1)', [id]);
  assert.equal(n, 1); // 停止中の訓練生は含まない

  assert.equal((await as(U.x, 'select * from announcements where id = $1', [id])).length, 1);
  assert.equal((await as(U.y, 'select * from announcements where id = $1', [id])).length, 0);

  await as(U.x, 'select mark_announcement_read($1)', [id]);
  await as(U.y, 'select mark_announcement_read($1)', [id]); // 対象外は何も起きない
  const rows = await as(U.staff1, 'select trainee_id, read_at from announcement_recipients where announcement_id = $1', [id]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].trainee_id, U.x);
  assert.ok(rows[0].read_at);

  // 配信後は宛先を変えられない
  await assert.rejects(
    as(U.staff1, "insert into announcement_targets (announcement_id, target_type, class_id) values ($1,'class',$2)", [id, class1]),
    /row-level security/,
  );
});

test('全体配信：A校の有効な訓練生全員に届く（他校・停止中は除く）', async () => {
  const id = await createAnnouncement(U.admin, '全体あて', [{ type: 'all' }]);
  const [{ publish_announcement: n }] = await as(U.admin, 'select publish_announcement($1)', [id]);
  assert.equal(n, 2);
  // 訓練生は他人の既読状況を見られない
  const rows = await as(U.x, 'select trainee_id from announcement_recipients where announcement_id = $1', [id]);
  assert.deepEqual(rows.map((r) => r.trainee_id), [U.x]);
});

test('予約配信：時刻になるまで見えず、定期処理で配信される', async () => {
  const id = await createAnnouncement(U.admin, '予約', [{ type: 'course', course: course1 }]);
  await as(U.admin, "select publish_announcement($1, now() + interval '1 hour')", [id]);
  assert.equal((await as(U.x, 'select * from announcements where id = $1', [id])).length, 0);
  await sudo("update announcements set publish_at = now() - interval '1 minute' where id = $1", [id]);
  const [{ publish_due_announcements: n }] = await sudo('select publish_due_announcements()');
  assert.equal(n, 1);
  assert.equal((await as(U.x, 'select * from announcements where id = $1', [id])).length, 1);
});

test('訓練生は配信処理を直接呼べない', async () => {
  await assert.rejects(as(U.x, 'select publish_due_announcements()'), /permission denied/);
});

test('同じ携帯番号は二重に登録できない（表記ゆれも同じ番号として扱う）', async () => {
  await sudo("update trainee_details set phone = '090-1111-2222' where profile_id = $1", [U.x]);
  await assert.rejects(sudo("update trainee_details set phone = '09011112222' where profile_id = $1", [U.y]), /duplicate key/);
  await sudo("update trainee_details set email = null where profile_id = $1", [U.y]); // メールは空でもよい
});
