// 添付ファイルの権限テスト
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, sudo, as, setupWorld } from './fixtures.mjs';

let W;
before(async () => { W = await setupWorld('att'); });
after(() => pool.end());

async function upload(by, annId, file = 'a.pdf') {
  const path = `announcements/${annId}/${file}`;
  await as(by, "insert into storage.objects (bucket_id, name) values ('attachments', $1)", [path]);
  await as(by, "insert into attachments (org_id, kind, announcement_id, storage_path, file_name, mime_type, size_bytes) values ($1,'announcement',$2,$3,$4,'application/pdf',1000)", [W.orgA, annId, path, file]);
  return path;
}

test('作成者は自分のお知らせにファイルを添付でき、宛先の訓練生だけが見られる', async () => {
  const { U, class1 } = W;
  const id = await W.createAnnouncement(U.staff1, '添付あり', [{ type: 'class', class: class1 }]);
  const path = await upload(U.staff1, id);

  // 配信前：訓練生には見えない
  assert.equal((await as(U.x, 'select * from attachments')).length, 0);
  await as(U.staff1, 'select publish_announcement($1)', [id]);

  assert.equal((await as(U.x, 'select * from attachments where announcement_id = $1', [id])).length, 1);
  assert.equal((await as(U.x, "select * from storage.objects where name = $1", [path])).length, 1);
  // 宛先外の訓練生・他校には見えない
  assert.equal((await as(U.y, 'select * from attachments')).length, 0);
  assert.equal((await as(U.y, "select * from storage.objects where name = $1", [path])).length, 0);
  assert.equal((await as(U.other, "select * from storage.objects")).length, 0);
});

test('他人のお知らせや訓練生はファイルを置けない', async () => {
  const { U, class1 } = W;
  const id = await W.createAnnouncement(U.staffAll, '他人の', [{ type: 'class', class: class1 }]);
  await assert.rejects(upload(U.staff1, id), /row-level security/);
  await assert.rejects(upload(U.x, id), /row-level security/);
  // 変な場所には置けない
  await assert.rejects(
    as(U.admin, "insert into storage.objects (bucket_id, name) values ('attachments', 'secret/x.pdf')"),
    /row-level security/,
  );
  await assert.rejects(
    as(U.admin, "insert into storage.objects (bucket_id, name) values ('attachments', 'announcements/not-a-uuid/x.pdf')"),
    /row-level security/,
  );
  // 管理者は置ける
  await upload(U.admin, id, 'b.pdf');
});

test('別のお知らせのフォルダを指す添付情報は登録できない', async () => {
  const { U, class1 } = W;
  const mine = await W.createAnnouncement(U.staff1, '自分の', [{ type: 'class', class: class1 }]);
  const theirs = await W.createAnnouncement(U.staffAll, '他人の2', [{ type: 'class', class: class1 }]);
  await assert.rejects(
    as(U.staff1, "insert into attachments (org_id, kind, announcement_id, storage_path, file_name, mime_type, size_bytes) values ($1,'announcement',$2,$3,'x','application/pdf',1)", [W.orgA, mine, `announcements/${theirs}/x.pdf`]),
    /check constraint|row-level security/,
  );
});

test('一括登録の記録は訓練生管理の権限がある人だけ', async () => {
  const { U, orgA } = W;
  await as(U.staffAll, 'insert into import_batches (org_id, total) values ($1, 3)', [orgA]);
  await assert.rejects(as(U.staff1, 'insert into import_batches (org_id, total) values ($1, 3)', [orgA]), /row-level security/);
  assert.equal((await as(U.staff1, 'select * from import_batches')).length, 0);
  assert.equal((await as(U.admin, 'select * from import_batches')).length, 1);
  void sudo;
});
