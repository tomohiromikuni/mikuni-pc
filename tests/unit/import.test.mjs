import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRows, parseDate, clean, templateCsv } from '../../src/lib/import-validate.ts';

// クラスは使わない運用：期ごとに1つの所属先
const classes = [
  { id: 'c1', courseName: '2026年11月期', name: '2026年11月期' },
  { id: 'c2', courseName: '2026年8月期', name: '2026年8月期' },
];
const H = ['氏名', 'フリガナ', '電話番号', 'メールアドレス', '期', '入校日', '修了予定日'];

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

test('期の名前で所属が決まる（メールなし・携帯番号あり）', () => {
  const { rows } = validateRows([H, ['山田 花子', 'ヤマダ', '090-1234-5678', '', '2026年8月期', '2026/4/1', '2026/9/30']], classes);
  assert.deepEqual(rows[0].errors, []);
  assert.equal(rows[0].phone, '09012345678');
  assert.equal(rows[0].class_id, 'c2');
  assert.equal(rows[0].class_label, '2026年8月期');
});

test('よくある間違いを行ごとに指摘する', () => {
  const { rows } = validateRows(
    [
      H,
      ['', '', '', 'bad-email', '', '', ''],
      ['佐藤', '', '090-1111-2222', '', '2027年1月期', '2026/13/1', ''],
      ['鈴木', '', '09011112222', '', '', '', ''],
      ['田中', '', '1234', '', '', '2026/9/1', '2026/4/1'],
      ['高橋', '', '080-9999-0000', '', '', '', ''],
    ],
    classes,
    { phones: new Set(['08099990000']) },
  );
  assert.deepEqual(rows[0].errors, ['氏名が空です', '携帯番号が空です', 'メールアドレスの形式が正しくありません']);
  assert.ok(rows[1].errors.some((e) => e.includes('2027年1月期')));
  assert.ok(rows[1].errors.some((e) => e.includes('入校日')));
  assert.ok(rows[2].errors.some((e) => e.includes('3行目と重複')));
  assert.ok(rows[3].errors.some((e) => e.includes('携帯番号の形式')));
  assert.ok(rows[3].errors.some((e) => e.includes('入校日より前')));
  assert.deepEqual(rows[4].errors, ['この携帯番号はすでに登録されています']);
  assert.equal(rows[2].class_label, '未所属'); // 期が空なら未所属
});

test('見出しの表記ゆれ（コース・期生）と空行に対応する', () => {
  const { rows, headerError } = validateRows([[], ['名前', '携帯', 'コース'], ['A', '09000000000', '2026年11月期'], ['', '', '']], classes);
  assert.equal(headerError, undefined);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].class_id, 'c1');
});

test('必要な列がなければ全体エラー', () => {
  assert.match(validateRows([['氏名', 'メール'], ['A', 'a@b.jp']], classes).headerError, /電話番号/);
  assert.match(validateRows([], classes).headerError, /データがありません/);
});

test('テンプレートは BOM 付きで見出しを含む', () => {
  assert.ok(templateCsv().startsWith('﻿氏名,フリガナ,電話番号,メールアドレス,期'));
});
