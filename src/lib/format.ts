const TZ = 'Asia/Tokyo';

/** 日本時間の「YYYY-MM-DD」 */
export function jstDateKey(d: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(d);
}

/** 「今日 18:00」「昨日 9:05」「11/18(水) 9:05」「2025/3/1」のような分かりやすい表示 */
export function friendlyDateTime(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat('ja-JP', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(d);
  const key = jstDateKey(d);
  if (key === jstDateKey(now)) return `今日 ${time}`;
  if (key === jstDateKey(new Date(now.getTime() - 86400000))) return `昨日 ${time}`;
  const sameYear = key.slice(0, 4) === jstDateKey(now).slice(0, 4);
  const date = new Intl.DateTimeFormat('ja-JP', {
    timeZone: TZ,
    ...(sameYear ? {} : { year: 'numeric' }),
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(d);
  return `${date} ${time}`;
}

/** フォームの「日時」入力（日本時間）を UTC の ISO 文字列に */
export function jstLocalToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value.length === 16 ? value + ':00' : value}+09:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const [y, m, d] = value.split('-');
  return `${y}/${Number(m)}/${Number(d)}`;
}
