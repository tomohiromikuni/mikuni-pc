// 内閣府「国民の祝日」CSV（https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv）の読み取り
export const HOLIDAY_CSV_URL = 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv';

/** CSV の中身から { day: 'YYYY-MM-DD', name } の一覧を作る（fromYear 年以降のみ） */
export function parseHolidayCsv(text: string, fromYear: number): { day: string; name: string }[] {
  const out: { day: string; name: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2}),(.+)$/.exec(line.trim());
    if (!m || Number(m[1]) < fromYear) continue;
    out.push({ day: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, name: m[4].trim() });
  }
  return out;
}

/** 内閣府のサイトから取得（Shift_JIS） */
export async function fetchHolidays(fromYear: number) {
  const res = await fetch(HOLIDAY_CSV_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`祝日データを取得できませんでした（${res.status}）`);
  const text = new TextDecoder('shift_jis').decode(await res.arrayBuffer());
  const list = parseHolidayCsv(text, fromYear);
  if (list.length === 0) throw new Error('祝日データの形式が想定と違います');
  return list;
}
