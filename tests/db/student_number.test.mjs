// 受講番号（期の番号＋出席番号）のテスト
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, sudo, as, setupWorld } from './fixtures.mjs';

let W;
before(async () => {
  W = await setupWorld('seat');
});
after(() => pool.end());

test('期の番号は同じ学校の中で重複できない（別の学校ならよい）', async () => {
  await as(W.U.admin, 'update courses set cohort_no = 27 where id = $1', [W.course1]);
  await assert.rejects(as(W.U.admin, 'update courses set cohort_no = 27 where id = $1', [W.course2]), /duplicate|unique/);
  const [{ id }] = await sudo("insert into courses (org_id, name, cohort_no) values ($1, '他校', 27) returning id", [W.orgB]);
  assert.ok(id);
});

test('出席番号は同じ期の中で重複できない。スタッフ（訓練生の編集権限あり）は設定できる', async () => {
  await as(W.U.staffAll, 'update enrollments set seat_no = 5 where trainee_id = $1', [W.U.x]);
  await assert.rejects(as(W.U.staffAll, 'update enrollments set seat_no = 5 where trainee_id = $1', [W.U.susp]), /duplicate|unique/);
  // 別の期なら同じ番号でもよい
  await as(W.U.staffAll, 'update enrollments set seat_no = 5 where trainee_id = $1', [W.U.y]);
  // 訓練生は自分の出席番号を変えられない
  const r = await as(W.U.x, 'update enrollments set seat_no = 9 where trainee_id = $1 returning id', [W.U.x]);
  assert.equal(r.length, 0);
});

test('期の名前の数字から期の番号を入れる（重複するときは入れない）', async () => {
  const { readFileSync } = await import('node:fs');
  const sql = readFileSync(new URL('../../supabase/migrations/20261124000012_student_number.sql', import.meta.url), 'utf8');
  const c = await pool.connect();
  try {
    await c.query('begin');
    const [{ id: a }] = (await c.query("insert into courses (org_id, name) values ($1, '第30期 Web') returning id", [W.orgA])).rows;
    const [{ id: b }] = (await c.query("insert into courses (org_id, name) values ($1, '31期（午前）') returning id", [W.orgA])).rows;
    const [{ id: y }] = (await c.query("insert into courses (org_id, name) values ($1, '2027年1期') returning id", [W.orgA])).rows;
    const [{ id: d1 }] = (await c.query("insert into courses (org_id, name) values ($1, '40期A') returning id", [W.orgA])).rows;
    const [{ id: d2 }] = (await c.query("insert into courses (org_id, name) values ($1, '40期B') returning id", [W.orgA])).rows;
    await c.query(sql);
    const get = async (id) => (await c.query('select cohort_no from courses where id = $1', [id])).rows[0].cohort_no;
    assert.equal(await get(a), 30);
    assert.equal(await get(b), 31);
    assert.equal(await get(y), null); // 「2027年1期」は年の数字なので入れない
    assert.equal(await get(d1), null); // 40期が2つあるので自動では入れない
    assert.equal(await get(d2), null);
  } finally {
    await c.query('rollback');
    c.release();
  }
});
