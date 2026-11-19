/** 通知しない日の表示用のまとめ方（画面の見やすさのための計算だけ） */

export type CalDay = { day: string; kind: string; name: string | null };
export type ClosureRange = { from: string; to: string; name: string; days: number };

const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const nextDay = (d: string) => new Date(new Date(d + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10);

/** 「12/27（土）」の形 */
export function shortDay(d: string) {
  const dt = new Date(d + 'T00:00:00Z');
  return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}（${DOW[dt.getUTCDay()]}）`;
}

/** 連続していて名前が同じ休校日を、1つの期間にまとめる */
export function groupClosures(days: CalDay[]): ClosureRange[] {
  const out: ClosureRange[] = [];
  for (const d of days.filter((x) => x.kind === 'closure').sort((a, b) => a.day.localeCompare(b.day))) {
    const last = out[out.length - 1];
    const name = d.name ?? '';
    if (last && last.name === name && nextDay(last.to) === d.day) {
      last.to = d.day;
      last.days++;
    } else out.push({ from: d.day, to: d.day, name, days: 1 });
  }
  return out;
}

/** 祝日を月ごとにまとめる（年が変わる月だけ「2027年1月」のように年を付ける） */
export function groupHolidaysByMonth(days: CalDay[]): { label: string; items: { day: string; text: string }[] }[] {
  const out: { key: string; label: string; items: { day: string; text: string }[] }[] = [];
  let lastYear = '';
  for (const d of days.filter((x) => x.kind === 'holiday').sort((a, b) => a.day.localeCompare(b.day))) {
    const [y, m, dd] = d.day.split('-');
    const key = `${y}-${m}`;
    let g = out[out.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: y !== lastYear ? `${y}年${Number(m)}月` : `${Number(m)}月`, items: [] };
      lastYear = y;
      out.push(g);
    }
    g.items.push({ day: d.day, text: `${Number(dd)}日（${DOW[new Date(d.day + 'T00:00:00Z').getUTCDay()]}）${d.name ?? ''}` });
  }
  return out.map(({ label, items }) => ({ label, items }));
}
