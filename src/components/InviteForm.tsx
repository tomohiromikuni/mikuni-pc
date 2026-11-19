'use client';
import { useState } from 'react';
import { Field } from '@/components/ui';

/** 招待・パスワード再設定：設定できたらページ全体を読み込み直して次へ（ログイン情報を確実に反映） */
export function InviteForm({ action, loginLabel, loginValue }: { action: (f: FormData) => Promise<{ ok: true }>; loginLabel: string; loginValue: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <form
      action={async (f) => {
        setBusy(true);
        const r = await action(f);
        if (r?.ok) window.location.assign('/terms');
        else setBusy(false);
      }}
      className="space-y-4"
    >
      <Field label={loginLabel}>
        <input value={loginValue} readOnly className="opacity-70" />
      </Field>
      <Field label="パスワード" hint="8文字以上。ほかのサービスと同じものは避けてください">
        <input name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="パスワード（確認のためもう一度）">
        <input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <button type="submit" disabled={busy} aria-busy={busy} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2 font-bold text-white disabled:cursor-wait disabled:opacity-80">
        {busy && <span aria-hidden className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
        {busy ? '設定しています…' : '登録する'}
      </button>
    </form>
  );
}
