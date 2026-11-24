import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatStudentNo, parseNo, rosterLoginEmail, sameName } from '../../src/lib/student-number.ts';

test('番号は全角・先頭の0・空白を整えて読む', () => {
  assert.equal(parseNo('２７'), 27);
  assert.equal(parseNo(' 05 '), 5);
  assert.equal(parseNo('0'), null);
  assert.equal(parseNo('1000'), null);
  assert.equal(parseNo('12a'), null);
  assert.equal(parseNo(''), null);
  assert.equal(parseNo('120', 9999), 120);
});

test('受講番号の表示', () => {
  assert.equal(formatStudentNo(27, 5), '27期生 5番');
  assert.equal(formatStudentNo(27, null), '');
});

test('内部用のログインIDは英数字だけ', () => {
  assert.equal(rosterLoginEmail('3F2A-11b9-xyz', 'phone.invalid'), 't3f2a11b9xyz@phone.invalid');
});

test('氏名は空白と全角半角の違いを無視して比べる', () => {
  assert.ok(sameName('青木 さくら', '青木　さくら'));
  assert.ok(sameName('青木さくら', ' 青木 さくら '));
  assert.ok(!sameName('青木さくら', '青木さら'));
  assert.ok(!sameName('', ''));
});
