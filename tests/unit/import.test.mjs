import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRows, parseDate, clean, templateCsv } from '../../src/lib/import-validate.ts';

const classes = [
  { id: 'c1', courseName: 'Webデザイン科', name: 'A組' },
  { id: 'c2', courseName: 'Webデザイン科', name: 'B組' },
  { id: 'c3', courseName: '事務科', name: 'A組' },
];
const H = ['氏名', 'フリガナ', '電話番号', 'メールアドレス', 'コース', 'クラス', '入校日', '修了予定日'];

test('日付のいろいろな書き方を読める', () => {
  assert.equal(parseDate('2026/4/1'), '2026-04-01');
  assert.equal(parseDate('2026-04-01'), '2026-04-01');
  assert.equal(parseDate('2026年4月1日'), '2026-04-01');
  assert.equal(parseDate('２０２６／４／１'), '2026-04-01');
  assert.equal(parseDate(new Date(Date.UTC(2026, 3, 1))), '2026-04-01');
  assert.equal(parseDate(46113), '2026-04-01');
  assert.equal(parseDate(''), '');
  assert.equal(parseDate('2026/2/30'), null);
  assert.equal(parseDate('来週'), null);
});

test('全角を半角に揃える', () => {
  assert.equal(clean('０９０－１２３４'), '090-1234');
});

test('メールなし・携帯番号ありの正しい行はエラーなし', () => {
  const { rows } = validateRows([H, ['山田 花子', 'ヤマダ', '090-1234-5678', '', 'Webデザイン科', 'B組', '2026/4/1', '2026/9/30']], classes);
  assert.deepEqual(rows[0].errors, []);
  assert.equal(rows[0].phone, '09012345678');
  assert.equal(rows[0].email, '');
  assert.equal(rows[0].class_id, 'c2');
});

test('よくある間違いを行ごとに指摘する', () => {
  const { rows } = validateRows(
    [
      H,
      ['', '', '', 'bad-email', '', '', '', ''],
      ['佐藤', '', '090-1111-2222', '', 'Webデザイン科', 'C組', '2026/13/1', ''],
      ['鈴木', '', '09011112222', '', '', 'A組', '', ''],
      ['田中', '', '1234', '', 'Webデザイン科', '', '2026/9/1', '2026/4/1'],
      ['高橋', '', '080-9999-0000', '', '', '', '', ''],
    ],
    classes,
    { phones: new Set(['08099990000']) },
  );
  assert.deepEqual(rows[0].errors, ['氏名が空です', '携帯番号が空です', 'メールアドレスの形式が正しくありません']);
  assert.ok(rows[1].errors.some((e) => e.includes('C組')));
  assert.ok(rows[1].errors.some((e) => e.includes('入校日')));
  assert.ok(rows[2].errors.some((e) => e.includes('3行目と重複')));
  assert.ok(rows[2].errors.some((e) => e.includes('複数のコース')));
  assert.ok(rows[3].errors.some((e) => e.includes('携帯番号の形式')));
  assert.ok(rows[3].errors.some((e) => e.includes('クラスが空')));
  assert.deepEqual(rows[4].errors, ['この携帯番号はすでに登録されています']);
});

test('見出しの表記ゆれ・空行に対応する', () => {
  const { rows, headerError } = validateRows([[], ['名前', '携帯', 'クラス名'], ['A', '09000000000', 'B組'], ['', '', '']], classes);
  assert.equal(headerError, undefined);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].class_id, 'c2');
});

test('必要な列がなければ全体エラー', () => {
  assert.match(validateRows([['氏名', 'メール'], ['A', 'a@b.jp']], classes).headerError, /電話番号/);
  assert.match(validateRows([], classes).headerError, /データがありません/);
});

test('テンプレートは BOM 付きで見出しを含む', () => {
  assert.ok(templateCsv().startsWith('﻿氏名,フリガナ,電話番号'));
});
