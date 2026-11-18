// 個別チャットの権限テスト：本人と、権限のある担当スタッフ以外は見られないこと
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, sudo, as, setupWorld } from './fixtures.mjs';

let W, roomX;
before(async () => {
  W = await setupWorld('chat');
  // 1組担当でチャット権限のあるスタッフ
  await sudo("insert into staff_permissions values ($1,'chat')", [W.U.staff1]);
});
after(() => pool.end());

const send = (by, room, body) =>
  as(by, 'insert into chat_messages (org_id, room_id, body) values ($1,$2,$3) returning id', [W.orgA, room, body]).then((r) => r[0].id);

test('訓練生は自分のルームを作って送信できる', async () => {
  [{ ensure_my_chat_room: roomX }] = await as(W.U.x, 'select ensure_my_chat_room()');
  const [{ ensure_my_chat_room: again }] = await as(W.U.x, 'select ensure_my_chat_room()');
  assert.equal(again, roomX);
  await send(W.U.x, roomX, '質問があります');
  const [room] = await as(W.U.x, 'select status, last_sender_role from chat_rooms');
  assert.deepEqual(room, { status: 'open', last_sender_role: 'trainee' });
});

test('他の訓練生・他校・権限のないスタッフ・担当外スタッフには見えない', async () => {
  const { U } = W;
  for (const who of [U.y, U.other, U.adminB, U.staffNone, U.susp]) {
    assert.equal((await as(who, 'select * from chat_messages')).length, 0, who);
    assert.equal((await as(who, 'select * from chat_rooms')).length, 0, who);
  }
  // 訓練生Yは X のルームに送信できない
  await assert.rejects(send(U.y, roomX, 'のぞき'), /row-level security/);
  // 権限のないスタッフはルームを開けない
  await assert.rejects(as(U.staffNone, 'select ensure_chat_room($1)', [U.x]), /権限がありません/);
});

test('担当スタッフ・管理者は読めて返信でき、状態が「対応中」になる', async () => {
  const { U } = W;
  assert.equal((await as(U.staff1, 'select * from chat_messages where room_id = $1', [roomX])).length, 1);
  assert.equal((await as(U.admin, 'select * from chat_messages where room_id = $1', [roomX])).length, 1);
  await send(U.staff1, roomX, 'どうしましたか？');
  const [room] = await as(U.admin, 'select status from chat_rooms where id = $1', [roomX]);
  assert.equal(room.status, 'in_progress');
});

test('なりすまし送信はできない', async () => {
  await assert.rejects(
    as(W.U.x, 'insert into chat_messages (org_id, room_id, sender_id, body) values ($1,$2,$3,$4)', [W.orgA, roomX, W.U.staff1, '偽']),
    /row-level security/,
  );
});

test('未読数と既読', async () => {
  const { U } = W;
  const [{ my_chat_unread: n }] = await as(U.x, 'select my_chat_unread()');
  assert.equal(n, 1);
  await as(U.x, 'select mark_chat_read($1)', [roomX]);
  const [{ my_chat_unread: n2 }] = await as(U.x, 'select my_chat_unread()');
  assert.equal(n2, 0);
  // 訓練生は事務局側の既読状況を見られる（「既読」表示用）
  const reads = await as(U.x, 'select user_id from chat_reads where room_id = $1', [roomX]);
  assert.ok(reads.some((r) => r.user_id === U.staff1));
});

test('完了にした後に訓練生から届くと「未対応」に戻る', async () => {
  const { U } = W;
  await as(U.staff1, "update chat_rooms set status = 'done' where id = $1", [roomX]);
  await send(U.x, roomX, 'もう一つ');
  const [room] = await as(U.staff1, 'select status from chat_rooms where id = $1', [roomX]);
  assert.equal(room.status, 'open');
  // 訓練生は状態を変えられない
  const r = await as(U.x, "update chat_rooms set status = 'done' where id = $1 returning id", [roomX]);
  assert.equal(r.length, 0);
});

test('スタッフ用メモは訓練生には見えない', async () => {
  const { U } = W;
  await as(U.staff1, 'insert into chat_notes (room_id, body) values ($1, $2)', [roomX, '要フォロー']);
  assert.equal((await as(U.x, 'select * from chat_notes')).length, 0);
  assert.equal((await as(U.admin, 'select * from chat_notes')).length, 1);
  await assert.rejects(as(U.x, 'insert into chat_notes (room_id, body) values ($1, $2)', [roomX, 'x']), /row-level security/);
});

test('チャットの添付は参加者だけが置けて、参加者だけが見られる', async () => {
  const { U } = W;
  const msg = await send(U.x, roomX, '写真です');
  const path = `chat/${roomX}/a.jpg`;
  await as(U.x, "insert into storage.objects (bucket_id, name) values ('attachments', $1)", [path]);
  await as(U.x, "insert into attachments (org_id, kind, message_id, storage_path, file_name, mime_type, size_bytes) values ($1,'chat',$2,$3,'a.jpg','image/jpeg',100)", [W.orgA, msg, path]);
  assert.equal((await as(U.staff1, 'select * from storage.objects where name = $1', [path])).length, 1);
  assert.equal((await as(U.y, 'select * from storage.objects where name = $1', [path])).length, 0);
  assert.equal((await as(U.staffNone, 'select * from attachments where message_id = $1', [msg])).length, 0);
  await assert.rejects(
    as(U.y, "insert into storage.objects (bucket_id, name) values ('attachments', $1)", [`chat/${roomX}/b.jpg`]),
    /row-level security/,
  );
});
