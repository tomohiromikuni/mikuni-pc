// 訓練生への通知を止める時間帯の判定（日本時間）
//   毎日 20:00〜翌7:00、土曜・日曜、国民の祝日、管理者が登録した休校日

export const QUIET_START_HOUR = 20;
export const QUIET_END_HOUR = 7;

type Parts = { key: string; hour: number; weekday: number };

function jstParts(d: Date): Parts {
  const jst = new Date(d.getTime() + 9 * 3600000); // 日本は夏時間がないので +9時間で固定
  return {
    key: jst.toISOString().slice(0, 10),
    hour: jst.getUTCHours(),
    weekday: jst.getUTCDay(), // 0=日 … 6=土
  };
}

/** その日（日本時間の日付）が通知しない日か：土日・祝日・休校日 */
export function isOffDay(key: string, offDays: Set<string>): boolean {
  const wd = new Date(key + 'T00:00:00Z').getUTCDay();
  return wd === 0 || wd === 6 || offDays.has(key);
}

/** いま訓練生に通知してはいけない時間か */
export function isQuietTime(d: Date, offDays: Set<string>): boolean {
  const p = jstParts(d);
  if (isOffDay(p.key, offDays)) return true;
  return p.hour >= QUIET_START_HOUR || p.hour < QUIET_END_HOUR;
}

/** 次に通知してよい時刻（＝次の「通知してよい日」の朝7:00 日本時間）。いま通知してよければそのまま返す */
export function nextAllowedTime(d: Date, offDays: Set<string>): Date {
  if (!isQuietTime(d, offDays)) return d;
  const p = jstParts(d);
  // 当日の7時前で、当日が通知してよい日なら当日の7時
  let key = p.key;
  if (!(p.hour < QUIET_END_HOUR && !isOffDay(key, offDays))) {
    do {
      key = new Date(new Date(key + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10);
    } while (isOffDay(key, offDays));
  }
  return new Date(`${key}T0${QUIET_END_HOUR}:00:00+09:00`);
}

/** 保留していた通知をまとめる文面 */
export function digestText(kinds: string[]): string {
  const c = (k: string) => kinds.filter((x) => x === k).length;
  const parts = [
    c('announcement') && `お知らせ${c('announcement')}件`,
    c('chat') && `メッセージ${c('chat')}件`,
    c('survey') && `回答のお願い${c('survey')}件`,
    c('reminder') && `再通知${c('reminder')}件`,
  ].filter(Boolean);
  return `${parts.join('・')}が届いています`;
}
