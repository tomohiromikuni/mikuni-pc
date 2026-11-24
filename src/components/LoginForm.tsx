'use client';
import { useActionState, useEffect, useState } from 'react';
import { login, type LoginResult } from '@/app/login/actions';
import { Field } from '@/components/ui';

const MODE_KEY = 'login-mode';

/** 受講番号の入力欄：「[27] 期生 [5] 番」（デザイン案A） */
export function StudentNoInput({ label, defaultCohort, defaultSeat }: { label: string; defaultCohort?: string; defaultSeat?: string }) {
  const box = 'h-13 flex-none rounded-xl text-center text-[22px] font-bold tabular-nums';
  // 入力欄は全体の設定で横いっぱいになるので、ここだけ幅を固定する
  const size = { width: '5.5rem' };
  return (
    <fieldset className="space-y-1">
      <legend className="mb-1 block text-sm">{label}</legend>
      <div className="flex items-center gap-2 text-base font-bold">
        <input name="cohort" aria-label="何期生" inputMode="numeric" pattern="[0-9０-９]*" maxLength={4} required defaultValue={defaultCohort} placeholder="27" className={box} style={size} />
        <span className="whitespace-nowrap">期生</span>
        <input name="seat" aria-label="出席番号" inputMode="numeric" pattern="[0-9０-９]*" maxLength={3} required defaultValue={defaultSeat} placeholder="5" className={box} style={size} />
        <span className="whitespace-nowrap">番</span>
      </div>
    </fieldset>
  );
}

/** ログインフォーム：訓練生は受講番号、スタッフ・以前から使っている人は携帯番号・メールアドレスでもログインできる */
export function LoginForm() {
  const [state, action, pending] = useActionState<LoginResult, FormData>(login, null);
  const done = !!state?.ok;
  const [mode, setMode] = useState<'number' | 'id'>('number');

  // 前回のログイン方法を覚えておく（スタッフが毎回切り替えなくて済むように）
  useEffect(() => {
    try {
      if (localStorage.getItem(MODE_KEY) === 'id') setMode('id');
    } catch {}
  }, []);
  const switchMode = (m: 'number' | 'id') => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {}
  };

  useEffect(() => {
    // ログイン情報を確実に反映させるため、ページ全体を読み込み直して移動する
    if (done) window.location.assign('/');
  }, [done]);

  return (
    <form action={action} className="space-y-4">
      {state?.error && (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 font-semibold text-red-800">{state.error}</p>
      )}
      {mode === 'number' ? (
        <StudentNoInput label="受講番号" />
      ) : (
        <Field label="携帯番号・メールアドレス" hint="スタッフ・管理者はメールアドレスでログインします">
          <input name="email" type="text" autoComplete="username" placeholder="090-1234-5678" required />
        </Field>
      )}
      <Field label="パスワード">
        <input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <button
        type="submit"
        disabled={pending || done}
        aria-busy={pending || done}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2 text-[17px] font-bold text-white hover:bg-brand-700 disabled:cursor-wait disabled:opacity-80"
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
      <p className="text-center text-sm">
        <button type="button" onClick={() => switchMode(mode === 'number' ? 'id' : 'number')} className="muted min-h-9 underline">
          {mode === 'number' ? 'スタッフの方・携帯番号でログインする方' : '受講番号でログインする'}
        </button>
      </p>
    </form>
  );
}
