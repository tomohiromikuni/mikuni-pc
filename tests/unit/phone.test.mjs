import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, formatPhone, loginIdToEmail, isPhoneLoginEmail } from '../../src/lib/phone.ts';

test('携帯番号のいろいろな書き方をそろえる', () => {
  assert.equal(normalizePhone('090-1234-5678'), '09012345678');
  assert.equal(normalizePhone('０９０ １２３４ ５６７８'), '09012345678'); // 全角・空白
  assert.equal(normalizePhone('+81 90-1234-5678'), '09012345678');
  assert.equal(normalizePhone('03-1234-5678'), '0312345678'); // 固定電話（10桁）
  assert.equal(normalizePhone('1234'), null);
  assert.equal(normalizePhone('abc'), null);
});

test('表示用の形式', () => {
  assert.equal(formatPhone('09012345678'), '090-1234-5678');
  assert.equal(formatPhone('0312345678'), '03-1234-5678');
});

test('ログイン画面の入力：番号ならIDに変換、メールはそのまま', () => {
  assert.equal(loginIdToEmail('090-1234-5678'), 'p09012345678@phone.invalid');
  assert.equal(loginIdToEmail('Admin@Example.com'), 'admin@example.com');
  assert.equal(loginIdToEmail('12'), null);
  assert.ok(isPhoneLoginEmail('p09012345678@phone.invalid'));
  assert.ok(!isPhoneLoginEmail('a@b.jp'));
});
