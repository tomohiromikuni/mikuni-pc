import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isQuietTime, nextAllowedTime, digestText } from '../../src/lib/quiet-hours.ts';

const J = (s) => new Date(s + '+09:00'); // 日本時間で書く
const holidays = new Set(['2026-11-23', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-04']);
const iso = (d) => new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' ');

test('平日の日中は通知してよい', () => {
  assert.equal(isQuietTime(J('2026-11-18T07:00:00'), holidays), false); // 水 7:00 ちょうど
  assert.equal(isQuietTime(J('2026-11-18T12:00:00'), holidays), false);
  assert.equal(isQuietTime(J('2026-11-18T19:59:59'), holidays), false);
});

test('20:00〜翌7:00は通知しない', () => {
  assert.equal(isQuietTime(J('2026-11-18T20:00:00'), holidays), true);
  assert.equal(isQuietTime(J('2026-11-18T23:30:00'), holidays), true);
  assert.equal(isQuietTime(J('2026-11-19T06:59:00'), holidays), true);
});

test('土日・祝日・休校日は終日通知しない', () => {
  assert.equal(isQuietTime(J('2026-11-21T12:00:00'), holidays), true); // 土
  assert.equal(isQuietTime(J('2026-11-22T12:00:00'), holidays), true); // 日
  assert.equal(isQuietTime(J('2026-11-23T12:00:00'), holidays), true); // 勤労感謝の日（月）
  assert.equal(isQuietTime(J('2026-12-30T12:00:00'), holidays), true); // 休校日
});

test('次に通知してよい時刻', () => {
  // 平日の夜 → 翌朝7時
  assert.equal(iso(nextAllowedTime(J('2026-11-18T21:00:00'), holidays)), '2026-11-19 07:00');
  // 平日の早朝 → 当日7時
  assert.equal(iso(nextAllowedTime(J('2026-11-19T05:00:00'), holidays)), '2026-11-19 07:00');
  // 金曜の夜 → 土日と祝日の月曜を飛ばして火曜7時
  assert.equal(iso(nextAllowedTime(J('2026-11-20T22:00:00'), holidays)), '2026-11-24 07:00');
  // 年末年始の休校日をまたぐ
  assert.equal(iso(nextAllowedTime(J('2026-12-29T20:30:00'), holidays)), '2027-01-05 07:00');
  // 通知してよい時間ならそのまま
  const now = J('2026-11-18T10:00:00');
  assert.equal(nextAllowedTime(now, holidays), now);
});

test('まとめ通知の文面', () => {
  assert.equal(digestText(['announcement', 'announcement', 'chat']), 'お知らせ2件・メッセージ1件が届いています');
  assert.equal(digestText(['survey']), '回答のお願い1件が届いています');
});
