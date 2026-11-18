// テスト用の共通準備：学校2つ、コース・クラス、管理者・スタッフ・訓練生
import pg from 'pg';

export const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });

/** 管理者権限（RLSを無視）で実行 */
export const sudo = (sql, params) => pool.query(sql, params).then((r) => r.rows);

/** 指定した利用者としてログインした状態で実行（userId=null はログイン前） */
export async function as(userId, sql, params) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${userId ? 'authenticated' : 'anon'}`);
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? '']);
    const r = await c.query(sql, params);
    await c.query('commit');
    return r.rows;
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}

/** tag ごとに独立した「世界」を作る（テストファイル同士が干渉しないように） */
export async function setupWorld(tag) {
  const U = {};
  const [{ id: orgA }] = await sudo('insert into organizations (name) values ($1) returning id', [`A校-${tag}`]);
  const [{ id: orgB }] = await sudo('insert into organizations (name) values ($1) returning id', [`B校-${tag}`]);
  const [{ id: course1 }] = await sudo("insert into courses (org_id, name) values ($1, 'Webコース') returning id", [orgA]);
  const [{ id: course2 }] = await sudo("insert into courses (org_id, name) values ($1, '事務コース') returning id", [orgA]);
  const [{ id: class1 }] = await sudo("insert into classes (org_id, course_id, name) values ($1,$2,'1組') returning id", [orgA, course1]);
  const [{ id: class2 }] = await sudo("insert into classes (org_id, course_id, name) values ($1,$2,'2組') returning id", [orgA, course2]);

  async function mkUser(key, org, role, name, { status = 'active', classId } = {}) {
    const [{ id }] = await sudo('insert into auth.users (email) values ($1) returning id', [`${key}-${tag}@example.com`]);
    await sudo('insert into profiles (id, org_id, role, status, full_name, terms_agreed_at) values ($1,$2,$3,$4,$5, now())', [id, org, role, status, name]);
    if (role === 'trainee') {
      const phone = '090' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
      await sudo('insert into trainee_details (profile_id, email, phone) values ($1,$2,$3)', [id, `${key}-${tag}@example.com`, phone]);
      if (classId) await sudo('insert into enrollments (org_id, trainee_id, class_id) values ($1,$2,$3)', [org, id, classId]);
    }
    U[key] = id;
    return id;
  }

  await mkUser('admin', orgA, 'admin', '管理 太郎');
  await mkUser('staffAll', orgA, 'staff', '全体 スタッフ');
  await sudo('insert into staff_scopes (staff_id) values ($1)', [U.staffAll]);
  for (const p of ['announce', 'manage_trainees', 'view_pii', 'chat', 'survey'])
    await sudo('insert into staff_permissions values ($1,$2)', [U.staffAll, p]);
  await mkUser('staff1', orgA, 'staff', '1組 講師');
  await sudo('insert into staff_scopes (staff_id, class_id) values ($1,$2)', [U.staff1, class1]);
  await sudo("insert into staff_permissions values ($1,'announce')", [U.staff1]);
  await mkUser('staffNone', orgA, 'staff', '権限なし スタッフ');
  await sudo('insert into staff_scopes (staff_id) values ($1)', [U.staffNone]);
  await mkUser('x', orgA, 'trainee', '訓練 エックス', { classId: class1 });
  await mkUser('y', orgA, 'trainee', '訓練 ワイ', { classId: class2 });
  await mkUser('susp', orgA, 'trainee', '停止 中', { classId: class1, status: 'suspended' });
  await mkUser('other', orgB, 'trainee', '他校 生徒');
  await mkUser('adminB', orgB, 'admin', '他校 管理者');

  /** お知らせを作成して宛先を設定（配信はしない） */
  async function createAnnouncement(by, title, targets) {
    const [{ id }] = await as(by, 'insert into announcements (org_id, title, body, created_by) values ($1,$2,$3,$4) returning id', [orgA, title, '本文', by]);
    for (const t of targets)
      await as(by, 'insert into announcement_targets (announcement_id, target_type, course_id, class_id) values ($1,$2,$3,$4)', [id, t.type, t.course ?? null, t.class ?? null]);
    return id;
  }

  return { U, orgA, orgB, course1, course2, class1, class2, createAnnouncement };
}
