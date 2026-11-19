import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasFinished } from '../../src/lib/completion.ts';

const today = '2026-11-19';

test('受講中の人には通知する', () => {
  assert.equal(hasFinished({ courseEndsOn: '2027-04-30', expectedCompletionOn: '2027-04-30' }, today), false);
  assert.equal(hasFinished({}, today), false); // 期・修了予定日が未設定
  assert.equal(hasFinished({ expectedCompletionOn: today }, today), false); // 修了日当日はまだ受講中
});

test('受講が終わった人には通知しない', () => {
  assert.equal(hasFinished({ courseArchived: true }, today), true);
  assert.equal(hasFinished({ courseEndsOn: '2026-11-18' }, today), true);
  assert.equal(hasFinished({ expectedCompletionOn: '2026-10-31' }, today), true);
});
