'use client';
import { useMemo, useState } from 'react';
import { Field } from '@/components/ui';

type Cls = { id: string; name: string; courseId: string; courseName: string };

/** 共通QRの登録フォーム：期 → 名前・携帯番号・パスワード */
export function JoinForm({ classes, action, terms }: { classes: Cls[]; action: (f: FormData) => Promise<{ ok: true }>; terms: string }) {
  // クラスは使わない運用：期ごとに1つだけ（同じ期が複数あれば最初のもの）
  const options = useMemo(() => [...new Map(classes.map((c) => [c.courseId, c])).values()], [classes]);
  const [busy, setBusy] = useState(false);

  return (
    <form
      action={async (f) => {
        setBusy(true);
        const r = await action(f);
        // 登録できたら、ログイン情報を確実に反映させるためページ全体を読み込み直して移動
        if (r?.ok) window.location.assign('/home');
        else setBusy(false);
      }}
      className="space-y-4"
    >
      <Field label="何期生ですか？">
        <select name="class_id" required defaultValue={options.length === 1 ? options[0].id : ''}>
          {options.length !== 1 && <option value="">選んでください</option>}
          {options.map((c) => <option key={c.id} value={c.id}>{c.courseName}</option>)}
        </select>
      </Field>
      <Field label="氏名"><input name="full_name" autoComplete="name" placeholder="山田 花子" required maxLength={100} /></Field>
      <Field label="フリガナ"><input name="full_name_kana" placeholder="ヤマダ ハナコ" required maxLength={100} /></Field>
      <Field label="携帯番号（ログインIDになります）"><input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="090-1234-5678" required /></Field>
      <Field label="パスワード" hint="8文字以上。忘れないようにしてください">
        <input name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="パスワード（確認のためもう一度）"><input name="confirm" type="password" autoComplete="new-password" minLength={8} required /></Field>
      {/* ロボット対策（人には見えない） */}
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <details className="rounded-xl border line p-3 text-sm">
        <summary className="cursor-pointer font-bold">利用規約と個人情報の取り扱い（タップで表示）</summary>
        <div className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap">{terms}</div>
      </details>
      <label className="flex items-center gap-2 font-normal"><input type="checkbox" name="agree" required /> 利用規約に同意します</label>
      <button type="submit" disabled={busy} aria-busy={busy} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2 font-bold text-white disabled:cursor-wait disabled:opacity-80">
        {busy && <span aria-hidden className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
        {busy ? '登録しています…' : '登録して始める'}
      </button>
    </form>
  );
}
