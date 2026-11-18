'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Field } from '@/components/ui';
import { createClient } from '@/lib/supabase/browser';

type Mode = { kind: 'loading' } | { kind: 'enroll'; factorId: string; qr: string; secret: string } | { kind: 'verify'; factorId: string } | { kind: 'error'; message: string };

/** 2段階認証：初回は認証アプリに登録、以降はログインのたびに6桁のコードを入力 */
export function MfaFlow() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>({ kind: 'loading' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) return setMode({ kind: 'error', message: error.message });
      const verified = data.totp.find((f) => f.status === 'verified');
      if (verified) return setMode({ kind: 'verify', factorId: verified.id });
      // 途中でやめた登録が残っていれば消してからやり直す
      for (const f of data.all.filter((f) => f.status !== 'verified')) await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data: en, error: ee } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `認証アプリ ${new Date().toISOString().slice(0, 10)}` });
      if (ee || !en) return setMode({ kind: 'error', message: ee?.message ?? '登録を開始できませんでした' });
      setMode({ kind: 'enroll', factorId: en.id, qr: en.totp.qr_code, secret: en.totp.secret });
    })();
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mode.kind !== 'enroll' && mode.kind !== 'verify') return;
    const code = String(new FormData(e.currentTarget).get('code') ?? '').replace(/\D/g, '');
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: mode.factorId, code });
    setBusy(false);
    if (error) return setError('コードが違うか、時間切れです。認証アプリに表示されている最新のコードを入力してください');
    router.replace('/admin');
    router.refresh();
  }

  if (mode.kind === 'loading') return <p className="muted">読み込み中…</p>;
  if (mode.kind === 'error') return <p className="text-red-700">{mode.message}</p>;
  return (
    <form onSubmit={submit} className="space-y-4">
      {mode.kind === 'enroll' ? (
        <div className="space-y-3 text-sm">
          <p>管理画面は個人情報を扱うため、パスワードに加えて<strong>スマホの認証アプリ</strong>での確認が必要です（最初の1回だけ登録します）。</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>スマホに「Google Authenticator」または「Microsoft Authenticator」を入れる</li>
            <li>アプリで「＋」→「QRコードをスキャン」を選び、下のQRコードを読み取る</li>
            <li>アプリに表示された6桁の数字を入力する</li>
          </ol>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mode.qr} alt="認証アプリ登録用のQRコード" width={180} height={180} className="rounded-lg bg-white p-2" />
          <p className="muted break-all text-xs">QRが読めない場合のキー：{mode.secret}</p>
        </div>
      ) : (
        <p className="text-sm">スマホの認証アプリに表示されている6桁の数字を入力してください。</p>
      )}
      <Field label="6桁のコード">
        <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus />
      </Field>
      {error && <p className="font-semibold text-red-700">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? '確認中…' : '確認する'}</Button>
      <p className="muted text-xs">スマホを機種変更した・なくした場合は、ほかの管理者に「2段階認証のリセット」を依頼してください。</p>
    </form>
  );
}
