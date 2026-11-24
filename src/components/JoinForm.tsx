'use client';
import { useState } from 'react';
import { StudentNoInput } from '@/components/LoginForm';
import { Field } from '@/components/ui';

/** 共通QRの登録フォーム（デザイン案A）：受講番号 → お名前 → パスワードを決める */
export function JoinForm({ action, terms }: { action: (f: FormData) => Promise<{ ok: true }>; terms: string }) {
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
      <StudentNoInput label="受講番号（カードに書いてある番号）" />
      <Field label="お名前"><input name="full_name" autoComplete="name" placeholder="山田 花子" required maxLength={100} /></Field>
      <Field label="パスワードを決める（8文字以上）" hint="次からのログインに使います。忘れないようにしてください">
        <input name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="もう一度（確認）"><input name="confirm" type="password" autoComplete="new-password" minLength={8} required /></Field>
      {/* ロボット対策（人には見えない） */}
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <details className="rounded-xl border line p-3 text-sm">
        <summary className="cursor-pointer font-bold">利用規約と個人情報の取り扱い（タップで表示）</summary>
        <div className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap">{terms}</div>
      </details>
      <label className="flex items-center gap-2 font-normal"><input type="checkbox" name="agree" required /> 利用規約に同意します</label>
      <button type="submit" disabled={busy} aria-busy={busy} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2 text-[17px] font-bold text-white disabled:cursor-wait disabled:opacity-80">
        {busy && <span aria-hidden className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
        {busy ? '登録しています…' : '登録して始める'}
      </button>
      <p className="muted text-xs leading-relaxed">名簿の受講番号とお名前が合っていると登録できます。次からは「受講番号」と「パスワード」でログインします。</p>
    </form>
  );
}
