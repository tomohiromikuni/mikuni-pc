import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHolidayCsv } from '../../src/lib/holidays.ts';

test('内閣府の祝日CSVを読める（古い年は除く）', () => {
  const csv = '国民の祝日・休日月日,国民の祝日・休日名称\r\n1955/1/1,元日\r\n2026/1/1,元日\r\n2026/11/23,勤労感謝の日\r\n2027/1/11,成人の日\r\n';
  assert.deepEqual(parseHolidayCsv(csv, 2026), [
    { day: '2026-01-01', name: '元日' },
    { day: '2026-11-23', name: '勤労感謝の日' },
    { day: '2027-01-11', name: '成人の日' },
  ]);
});
