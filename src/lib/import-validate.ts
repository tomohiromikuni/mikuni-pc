// Excel・CSV 一括登録：取り込み前のチェック（画面とテストの両方で使う純粋な関数）
import { normalizePhone } from './phone.ts';
import { parseNo } from './student-number.ts';

export const IMPORT_COLUMNS = ['氏名', 'フリガナ', '期', '出席番号', '電話番号', 'メールアドレス', '入校日', '修了予定日'] as const;

export type ImportClass = { id: string; courseName: string; name: string };

export type ImportRow = {
  line: number; // ファイル上の行番号（見出しが1行目）
  full_name: string;
  full_name_kana: string;
  email: string;
  phone: string;
  class_id: string;
  class_label: string;
  seat_no: string;
  enrolled_on: string;
  expected_completion_on: string;
  errors: string[];
};

type Cell = string | number | boolean | Date | null | undefined;

/** 全角英数字・全角スペースなどを半角に揃え、前後の空白を除く */
export function clean(v: Cell): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return toDateKey(v) ?? '';
  return String(v).normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function toDateKey(d: Date): string | null {
  if (Number.isNaN(d.getTime())) return null;
  // Excel の日付は「その日の0時（UTC）」として読み込まれる
  return d.toISOString().slice(0, 10);
}

/** 2026/4/1、2026-04-01、2026年4月1日、Excelの日付 → 2026-04-01。読めなければ null */
export function parseDate(v: Cell): string | null {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return toDateKey(v);
  if (typeof v === 'number') {
    // Excel のシリアル値（1900年基準）
    if (v > 20000 && v < 80000) return toDateKey(new Date(Date.UTC(1899, 11, 30) + v * 86400000));
    return null;
  }
  const s = clean(v);
  const m = /^(\d{4})[/\-.年](\d{1,2})[/\-.月](\d{1,2})日?$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return toDateKey(date);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 見出し行の位置を探し、列名 → 列番号 の対応を作る */
export function mapHeader(header: Cell[]): { map: Partial<Record<(typeof IMPORT_COLUMNS)[number], number>>; missing: string[] } {
  const names = header.map((h) => clean(h).replace(/[（(].*[)）]/, '').replace(/\s/g, ''));
  const alias: Record<string, (typeof IMPORT_COLUMNS)[number]> = {
    氏名: '氏名', 名前: '氏名', フリガナ: 'フリガナ', ふりがな: 'フリガナ', カナ: 'フリガナ',
    メールアドレス: 'メールアドレス', メール: 'メールアドレス', email: 'メールアドレス', Email: 'メールアドレス',
    電話番号: '電話番号', 電話: '電話番号', 携帯番号: '電話番号', 携帯電話: '電話番号', 携帯: '電話番号',
    出席番号: '出席番号', 番号: '出席番号', 番: '出席番号', No: '出席番号', 'No.': '出席番号',
    期: '期', 期生: '期', コース: '期', コース名: '期', 所属コース: '期',
    入校日: '入校日', コース開始日: '入校日', 開始日: '入校日',
    修了予定日: '修了予定日', 修了日: '修了予定日', 終了日: '修了予定日',
  };
  const map: Partial<Record<(typeof IMPORT_COLUMNS)[number], number>> = {};
  names.forEach((n, i) => {
    const key = alias[n];
    if (key && map[key] === undefined) map[key] = i;
  });
  const missing = (['氏名'] as const).filter((k) => map[k] === undefined);
  return { map, missing };
}

/** 表データ（1行目が見出し）をチェックして、登録用の行に変換する */
export function validateRows(
  sheet: Cell[][],
  classes: ImportClass[],
  existing: { emails?: Set<string>; phones?: Set<string> } = {},
): { rows: ImportRow[]; headerError?: string } {
  const nonEmpty = sheet.filter((r) => r.some((c) => clean(c) !== ''));
  if (nonEmpty.length === 0) return { rows: [], headerError: 'ファイルにデータがありません' };
  const headerIndex = sheet.indexOf(nonEmpty[0]);
  const { map, missing } = mapHeader(nonEmpty[0]);
  if (missing.length) return { rows: [], headerError: `見出し行に「${missing.join('」「')}」の列が見つかりません。テンプレートの見出しを使ってください` };

  const norm = (s: string) => s.normalize('NFKC').replace(/\s/g, '').toLowerCase();
  const seen = new Map<string, number>();
  const seenPhone = new Map<string, number>();
  const seenSeat = new Map<string, number>();
  const existingEmails = existing.emails ?? new Set<string>();
  const existingPhones = existing.phones ?? new Set<string>();
  const rows: ImportRow[] = [];

  sheet.forEach((r, i) => {
    if (i <= headerIndex || !r.some((c) => clean(c) !== '')) return;
    const get = (k: (typeof IMPORT_COLUMNS)[number]) => (map[k] === undefined ? undefined : r[map[k]!]);
    const errors: string[] = [];

    const full_name = clean(get('氏名'));
    const email = clean(get('メールアドレス')).toLowerCase();
    const course = clean(get('期'));
    const enrolled = parseDate(get('入校日') ?? '');
    const completion = parseDate(get('修了予定日') ?? '');

    const phoneRaw = clean(get('電話番号'));
    const phone = normalizePhone(phoneRaw);

    if (!full_name) errors.push('氏名が空です');
    // 携帯番号は任意（受講番号でログインする）
    if (!phoneRaw) {
      /* なし */
    } else if (!phone) errors.push('携帯番号の形式が正しくありません（例：090-1234-5678）');
    else if (existingPhones.has(phone)) errors.push('この携帯番号はすでに登録されています');
    else if (seenPhone.has(phone)) errors.push(`携帯番号が${seenPhone.get(phone)}行目と重複しています`);
    if (phone) seenPhone.set(phone, i + 1);
    if (email) {
      if (!EMAIL_RE.test(email)) errors.push('メールアドレスの形式が正しくありません');
      else if (existingEmails.has(email)) errors.push('このメールアドレスはすでに登録されています');
      else if (seen.has(email)) errors.push(`メールアドレスが${seen.get(email)}行目と重複しています`);
      seen.set(email, i + 1);
    }

    // 期の名前で所属先を探す（クラスは使わない運用）
    let class_id = '';
    let class_label = '未所属';
    if (course) {
      const hit = classes.find((c) => norm(c.courseName) === norm(course));
      if (!hit) errors.push(`「${course}」という期が見つかりません（「訓練生」画面の期の名前と同じにしてください）`);
      else {
        class_id = hit.id;
        class_label = hit.courseName;
      }
    }
    const seatRaw = clean(get('出席番号'));
    const seat = seatRaw ? parseNo(seatRaw) : null;
    if (seatRaw && !seat) errors.push('出席番号は1〜999の数字にしてください');
    else if (seat && !class_id && !course) errors.push('出席番号を入れるときは、期も入れてください');
    else if (seat && class_id) {
      const key = `${class_id}:${seat}`;
      if (seenSeat.has(key)) errors.push(`出席番号が${seenSeat.get(key)}行目と重複しています`);
      seenSeat.set(key, i + 1);
    }
    if (enrolled === null) errors.push('入校日の形式が正しくありません（例：2026/4/1）');
    if (completion === null) errors.push('修了予定日の形式が正しくありません（例：2026/9/30）');
    if (enrolled && completion && enrolled > completion) errors.push('修了予定日が入校日より前です');

    rows.push({
      line: i + 1,
      full_name,
      full_name_kana: clean(get('フリガナ')),
      email,
      phone: phone ?? phoneRaw,
      class_id,
      class_label,
      seat_no: seat ? String(seat) : '',
      enrolled_on: enrolled ?? '',
      expected_completion_on: completion ?? '',
      errors,
    });
  });
  return { rows };
}

/** テンプレート（Excel で文字化けしないよう BOM 付き UTF-8 の CSV） */
export function templateCsv(sample?: { courseName: string }): string {
  const course = sample?.courseName ?? '2026年11月期';
  const bom = String.fromCharCode(0xfeff);
  return bom + [IMPORT_COLUMNS.join(','), `山田 花子,ヤマダ ハナコ,${course},1,,,2026/4/1,2026/9/30`].join('\r\n') + '\r\n';
}
