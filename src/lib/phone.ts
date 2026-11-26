// 携帯番号の扱い（ログインIDとして使う）
//   メールアドレスを持たない訓練生は、携帯番号から作った「内部用のログインID」でログインする。
//   内部用IDは @phone.invalid（実在しないドメイン）なので、メールが送られることはない。

// ※一度運用を始めたら変更しないこと（変えると既存の訓練生がログインできなくなる）
const LOGIN_DOMAIN = (typeof process !== 'undefined' && process.env?.LOGIN_ID_DOMAIN) || 'phone.invalid';

/** 全角・ハイフン・空白・+81 を整えて、数字だけの国内形式（例：09012345678）にする。不正なら null */
export function normalizePhone(input: string): string | null {
  let d = input.normalize('NFKC').replace(/[^\d+]/g, '');
  if (d.startsWith('+81')) d = '0' + d.slice(3);
  else if (d.startsWith('81') && d.length === 12) d = '0' + d.slice(2);
  d = d.replace(/\D/g, '');
  return /^0\d{9,10}$/.test(d) ? d : null;
}

/** 表示用：090-1234-5678 */
export function formatPhone(digits: string | null | undefined): string {
  if (!digits) return '';
  const d = digits.replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`;
  return digits;
}

export function phoneToLoginEmail(digits: string): string {
  return `p${digits}@${LOGIN_DOMAIN}`;
}

export function isPhoneLoginEmail(email: string | null | undefined): boolean {
  return !!email && email.endsWith('@' + LOGIN_DOMAIN);
}

/** ログイン画面の入力（携帯番号 または メールアドレス）を、ログインに使うIDに変換 */
export function loginIdToEmail(input: string): string | null {
  const v = input.normalize('NFKC').trim();
  if (v.includes('@')) return v.toLowerCase();
  const p = normalizePhone(v);
  return p ? phoneToLoginEmail(p) : null;
}
