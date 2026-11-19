// 運営メンバーが「訓練生としても参加」するときのテスト
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, sudo, as, setupWorld } from './fixtures.mjs';

let W;
before(async () => {
  W = await setupWorld('dual');
  await sudo("insert into staff_permissions values ($1,'chat')", [W.U.staff1]);
});
after(() => pool.end());

test('スタッフは自分を「訓練生としても参加」にできない（管理者のみ）', async () => {
  await assert.rejects(as(W.U.staffAll, 'update profiles set also_trainee = true where id = $1', [W.U.x]), /管理者のみ/);
  const r = await as(W.U.staffAll, 'update profiles set also_trainee = true where id = $1 returning id', [W.U.staffAll]);
  assert.equal(r.length, 0); // 自分の行は更新対象外
});

test('管理者が自分を参加させると、クラスあてのお知らせ・出欠が自分にも届く', async () => {
  const { U, orgA, class1 } = W;
  await as(U.admin, 'update profiles set also_trainee = true where id = $1', [U.admin]);
  await as(U.admin, 'insert into enrollments (org_id, trainee_id, class_id) values ($1,$2,$3)', [orgA, U.admin, class1]);

  const id = await W.createAnnouncement(U.staff1, '1組あて', [{ type: 'class', class: class1 }]);
  const [{ publish_announcement: n }] = await as(U.staff1, 'select publish_announcement($1)', [id]);
  assert.equal(n, 2); // 訓練生X ＋ 管理者
  assert.equal((await as(U.admin, 'select * from announcement_recipients where trainee_id = $1 and announcement_id = $2', [U.admin, id])).length, 1);
  // 他校・別クラスあてには入らない
  const id2 = await W.createAnnouncement(U.staffAll, '2組あて', [{ type: 'class', class: W.class2 }]);
  await as(U.staffAll, 'select publish_announcement($1)', [id2]);
  assert.equal((await sudo('select * from announcement_recipients where trainee_id = $1 and announcement_id = $2', [U.admin, id2])).length, 0);
});

test('自分の事務局チャットを使え、送ると「訓練生側」として扱われ、自分には通知されない', async () => {
  const { U, orgA } = W;
  const [{ ensure_my_chat_room: room }] = await as(U.admin, 'select ensure_my_chat_room()');
  await as(U.admin, 'insert into chat_messages (org_id, room_id, body) values ($1,$2,$3)', [orgA, room, '訓練生として質問です']);
  const [r] = await sudo('select last_sender_role, status from chat_rooms where id = $1', [room]);
  assert.equal(r.last_sender_role, 'trainee');
  const toSelf = await sudo("select * from notification_queue where user_id = $1 and kind = 'chat'", [U.admin]);
  assert.equal(toSelf.length, 0);
  const toStaff = await sudo("select * from notification_queue where user_id = $1 and kind = 'chat'", [U.staff1]);
  assert.equal(toStaff.length, 1); // 1組担当＋チャット権限
  // 担当スタッフが返信すると、管理者（訓練生として）に通知
  await as(U.staff1, 'insert into chat_messages (org_id, room_id, body) values ($1,$2,$3)', [orgA, room, '回答です']);
  assert.equal((await sudo("select * from notification_queue where user_id = $1 and kind = 'chat'", [U.admin])).length, 1);
});

test('参加していないスタッフは、訓練生用のチャットを作れない', async () => {
  await assert.rejects(as(W.U.staffAll, 'select ensure_my_chat_room()'), /訓練生のみ/);
});

test('参加をやめれば、以後の配信には入らない', async () => {
  const { U, class1 } = W;
  await as(U.admin, 'update profiles set also_trainee = false where id = $1', [U.admin]);
  const id = await W.createAnnouncement(U.staff1, '1組あて2', [{ type: 'class', class: class1 }]);
  const [{ publish_announcement: n }] = await as(U.staff1, 'select publish_announcement($1)', [id]);
  assert.equal(n, 1);
});
