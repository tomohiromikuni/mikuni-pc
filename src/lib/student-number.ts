// 受講番号（「27期生の5番」）の扱い。画面とテストの両方で使う純粋な関数

/** 全角数字や空白を整えて、1〜max の整数にする。読めなければ null */
export function parseNo(input: unknown, max = 999): number | null {
  const s = String(input ?? '').normalize('NFKC').replace(/\s/g, '').replace(/^0+(?=\d)/, '');
  if (!/^\d{1,4}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= max ? n : null;
}

/** 表示用：「27期生 5番」（どちらかが無ければ空文字） */
export function formatStudentNo(cohort: number | null | undefined, seat: number | null | undefined): string {
  return cohort && seat ? `${cohort}期生 ${seat}番` : '';
}

/** 携帯番号もメールアドレスもない人の、内部用のログインID（実在しないドメインなのでメールは送られない） */
export function rosterLoginEmail(randomId: string, domain: string): string {
  return `t${randomId.replace(/[^a-z0-9]/gi, '').slice(0, 16).toLowerCase()}@${domain}`;
}

/** 名簿の氏名と、本人が入力した氏名が同じか（空白・全角半角の違いは無視） */
export function sameName(a: string, b: string): boolean {
  const n = (x: string) => x.normalize('NFKC').replace(/\s/g, '');
  return n(a) !== '' && n(a) === n(b);
}
