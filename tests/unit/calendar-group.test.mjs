import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupClosures, groupHolidaysByMonth, shortDay } from '../../src/lib/calendar-group.ts';

test('連続した同じ名前の休校日は1つの期間になる', () => {
  const r = groupClosures([
    { day: '2026-12-28', kind: 'closure', name: '年末年始休校' },
    { day: '2026-12-27', kind: 'closure', name: '年末年始休校' },
    { day: '2026-12-29', kind: 'closure', name: '年末年始休校' },
    { day: '2027-03-19', kind: 'closure', name: '施設点検' },
    { day: '2026-11-23', kind: 'holiday', name: '勤労感謝の日' },
  ]);
  assert.deepEqual(r, [
    { from: '2026-12-27', to: '2026-12-29', name: '年末年始休校', days: 3 },
    { from: '2027-03-19', to: '2027-03-19', name: '施設点検', days: 1 },
  ]);
});

test('祝日は月ごと、年が変わると年を付ける', () => {
  const r = groupHolidaysByMonth([
    { day: '2026-11-23', kind: 'holiday', name: '勤労感謝の日' },
    { day: '2027-01-01', kind: 'holiday', name: '元日' },
    { day: '2027-01-11', kind: 'holiday', name: '成人の日' },
    { day: '2027-02-11', kind: 'holiday', name: '建国記念の日' },
  ]);
  assert.deepEqual(r.map((g) => g.label), ['2026年11月', '2027年1月', '2月']);
  assert.equal(r[1].items.length, 2);
  assert.equal(r[1].items[0].text, '1日（金）元日');
  assert.equal(shortDay('2026-12-27'), '12/27（日）');
});
