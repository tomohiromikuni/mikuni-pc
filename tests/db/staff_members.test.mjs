// スタッフを「管理者」「メンバー」の2つにする変更のテスト
// （他のテストに影響しないよう、1つの取引の中で実行して最後に取り消す）
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pool, setupWorld } from './fixtures.mjs';

after(() => pool.end());

test('既存のメンバーに、すべての権限と全体の担当範囲が付く（何度実行しても同じ）', async () => {
  const W = await setupWorld('members');
  const sql = readFileSync(new URL('../../supabase/migrations/20261121000011_staff_members.sql', import.meta.url), 'utf8');
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(sql);
    await c.query(sql);
    const q = async (s, p) => (await c.query(s, p)).rows;
    const perms = await q('select permission from staff_permissions where staff_id = $1', [W.U.staff1]);
    const all = await q('select unnest(enum_range(null::staff_permission)) as p');
    assert.equal(perms.length, all.length);
    const scopes = await q('select course_id, class_id from staff_scopes where staff_id = $1', [W.U.staff1]);
    assert.deepEqual(scopes, [{ course_id: null, class_id: null }]);
    // 訓練生・管理者には何も付かない
    assert.equal((await q('select * from staff_permissions where staff_id = $1', [W.U.x])).length, 0);
    assert.equal((await q('select * from staff_permissions where staff_id = $1', [W.U.admin])).length, 0);
  } finally {
    await c.query('rollback');
    c.release();
  }
});
