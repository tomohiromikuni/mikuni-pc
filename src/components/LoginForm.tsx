'use client';
import { useActionState, useEffect } from 'react';
import { login, type LoginResult } from '@/app/login/actions';
import { Field } from '@/components/ui';

/** ログインフォーム：押したら「ログインしています…」、成功したらページ全体を読み込み直して移動 */
export function LoginForm() {
  const [state, action, pending] = useActionState<LoginResult, FormData>(login, null);
  const done = !!state?.ok;

  useEffect(() => {
    // ログイン情報を確実に反映させるため、ページ全体を読み込み直して移動する
    if (done) window.location.assign('/');
  }, [done]);

  return (
    <form action={action} className="space-y-4">
      {state?.error && (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 font-semibold text-red-800">{state.error}</p>
      )}
      <Field label="携帯番号" hint="スタッフ・管理者はメールアドレスでもログインできます">
        <input name="email" type="text" autoComplete="username" placeholder="090-1234-5678" required />
      </Field>
      <Field label="パスワード">
        <input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <button
        type="submit"
        disabled={pending || done}
        aria-busy={pending || done}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2 font-bold text-white hover:bg-brand-700 disabled:cursor-wait disabled:opacity-80"
      >
        {pending || done ? (
          <>
            <span aria-hidden className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            {done ? '移動しています…' : 'ログインしています…'}
          </>
        ) : (
          'ログイン'
        )}
      </button>
    </form>
  );
}
