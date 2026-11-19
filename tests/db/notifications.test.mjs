// 通知のテスト：正しい相手にだけ積まれること、他人の通知先に触れないこと
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, sudo, as, setupWorld } from './fixtures.mjs';

let W;
before(async () => {
  W = await setupWorld('ntf');
  await sudo("insert into staff_permissions values ($1,'chat')", [W.U.staff1]);
});
after(() => pool.end());

const queued = (userId) => sudo('select kind, title, url, ignore_quiet from notification_queue where user_id = $1 order by created_at', [userId]);

test('お知らせを配信すると宛先の訓練生にだけ通知が積まれる', async () => {
  const { U, class1 } = W;
  const id = await W.createAnnouncement(U.staff1, '健康診断', [{ type: 'class', class: class1 }]);
  await as(U.staff1, 'select publish_announcement($1)', [id]);
  const qx = await queued(U.x);
  assert.equal(qx.length, 1);
  assert.equal(qx[0].kind, 'announcement');
  assert.equal(qx[0].url, `/announcements/${id}`);
  assert.equal(qx[0].ignore_quiet, false);
  assert.equal((await queued(U.y)).length, 0);
  assert.equal((await queued(U.susp)).length, 0);
});

test('緊急の時間外通知は管理者だけが設定でき、設定すると ignore_quiet になる', async () => {
  const { U, orgA } = W;
  await assert.rejects(
    as(U.staff1, "insert into announcements (org_id, title, priority, notify_immediately, created_by) values ($1,'x','urgent',true,$2)", [orgA, U.staff1]),
    /管理者のみ/,
  );
  const [{ id }] = await as(U.admin, "insert into announcements (org_id, title, priority, notify_immediately, created_by) values ($1,'休講','urgent',true,$2) returning id", [orgA, U.admin]);
  await as(U.admin, "insert into announcement_targets (announcement_id, target_type) values ($1,'all')", [id]);
  await as(U.admin, 'select publish_announcement($1)', [id]);
  const q = (await queued(U.y)).find((r) => r.title.includes('休講'));
  assert.equal(q.title, '【緊急】休講');
  assert.equal(q.ignore_quiet, true);
});

test('チャット：訓練生から → 担当でチャット権限のある人と管理者へ。事務局から → 訓練生へ', async () => {
  const { U, orgA } = W;
  const [{ ensure_my_chat_room: room }] = await as(U.x, 'select ensure_my_chat_room()');
  await as(U.x, 'insert into chat_messages (org_id, room_id, body) values ($1,$2,$3)', [orgA, room, '相談です']);
  assert.ok((await queued(U.staff1)).some((r) => r.kind === 'chat' && r.title.includes('訓練 エックス')));
  assert.ok((await queued(U.admin)).some((r) => r.kind === 'chat'));
  assert.equal((await queued(U.staffAll)).filter((r) => r.kind === 'chat').length, 1); // 全体担当＋チャット権限あり
  assert.equal((await queued(U.staffNone)).length, 0); // 権限なし
  await as(U.staff1, 'insert into chat_messages (org_id, room_id, body) values ($1,$2,$3)', [orgA, room, '返信です']);
  assert.ok((await queued(U.x)).some((r) => r.kind === 'chat' && r.url === '/chat'));
});

test('通知の宛先は本人しか登録・閲覧できない。送信待ちには誰も触れない', async () => {
  const { U } = W;
  await as(U.x, "insert into push_subscriptions (endpoint, p256dh, auth) values ('https://push.example/x', 'k', 'a')");
  await assert.rejects(
    as(U.x, "insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.example/y', 'k', 'a')", [U.y]),
    /row-level security/,
  );
  assert.equal((await as(U.y, 'select * from push_subscriptions')).length, 0);
  assert.equal((await as(U.admin, 'select * from push_subscriptions')).length, 0);
  await assert.rejects(as(U.admin, 'select * from notification_queue'), /permission denied/);
  await assert.rejects(as(U.x, "insert into notification_queue (org_id, user_id, kind, title) values ($1,$2,'other','偽')", [W.orgA, U.y]), /permission denied/);
});

test('再通知：未読者だけ／担当範囲だけ。休校日は管理者だけが登録できる', async () => {
  const { U, class1, orgA } = W;
  const id = await W.createAnnouncement(U.staffAll, '再通知テスト', [{ type: 'all' }]);
  await as(U.staffAll, 'select publish_announcement($1)', [id]);
  await as(U.x, 'select mark_announcement_read($1)', [id]);
  const [{ remind_announcement: n }] = await as(U.staffAll, 'select remind_announcement($1)', [id]);
  assert.equal(n, 1); // Y だけ（X は既読）
  const [{ remind_announcement: n1 }] = await as(U.staff1, 'select remind_announcement($1)', [id]);
  assert.equal(n1, 0); // 1組担当には Y は担当外
  void class1;

  await as(U.admin, "insert into calendar_days (org_id, day, kind, name) values ($1, '2026-12-30', 'closure', '年末休校')", [orgA]);
  // メンバーも休校日を追加できる。削除は管理者だけ。訓練生は追加できない
  await as(U.staffAll, "insert into calendar_days (org_id, day, kind) values ($1, '2026-12-31', 'closure')", [orgA]);
  assert.equal((await as(U.staffAll, "delete from calendar_days where day = '2026-12-31' returning day")).length, 0);
  await assert.rejects(as(U.x, "insert into calendar_days (org_id, day, kind) values ($1, '2027-01-04', 'closure')", [orgA]), /row-level security/);
  assert.equal((await as(U.x, 'select * from calendar_days')).length, 2);
});
