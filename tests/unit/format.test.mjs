import { test } from 'node:test';
import assert from 'node:assert/strict';
import { friendlyDateTime, jstLocalToIso, formatDate } from '../../src/lib/format.ts';

test('予約日時（日本時間）を正しくUTCに変換する', () => {
  assert.equal(jstLocalToIso('2026-11-19T09:00'), '2026-11-19T00:00:00.000Z');
  assert.equal(jstLocalToIso(''), null);
  assert.equal(jstLocalToIso('abc'), null);
});

test('日時を分かりやすく表示する（日本時間基準）', () => {
  const now = new Date('2026-11-18T03:00:00Z'); // 日本時間 11/18 12:00
  assert.equal(friendlyDateTime('2026-11-18T00:30:00Z', now), '今日 9:30');
  assert.equal(friendlyDateTime('2026-11-17T14:59:00Z', now), '昨日 23:59');
  assert.equal(friendlyDateTime('2026-11-17T15:00:00Z', now), '今日 0:00'); // 日本時間の日付で判定
  assert.match(friendlyDateTime('2026-11-10T00:00:00Z', now), /^11\/10\(火\) 9:00$/);
  assert.match(friendlyDateTime('2025-03-01T00:00:00Z', now), /^2025\/3\/1/);
});

test('日付の表示', () => {
  assert.equal(formatDate('2026-04-01'), '2026/4/1');
  assert.equal(formatDate(null), '—');
});
