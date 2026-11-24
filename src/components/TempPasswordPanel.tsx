'use client';
import { useActionState } from 'react';
import type { TempPasswordResult } from '@/app/admin/trainees/actions';
import { Button } from '@/components/ui';

export function TempPasswordPanel({ issue }: { issue: () => Promise<TempPasswordResult> }) {
  const [state, action, pending] = useActionState<TempPasswordResult>(issue, null);
  return (
    <div className="space-y-3">
      <p className="text-sm">パスワードを忘れた場合は、仮パスワードを発行して本人に伝えてください。ログイン後、マイページの「パスワードを変更」で自分のものに変えてもらいます。</p>
      <form action={action}>
        <Button type="submit" variant="secondary" disabled={pending}>{pending ? '発行中…' : '仮パスワードを発行'}</Button>
      </form>
      {state && 'error' in state && <p className="font-semibold text-red-700">{state.error}</p>}
      {state && 'password' in state && (
        <div className="rounded-xl border-2 border-dashed border-brand-500 p-4">
          <p className="text-sm">仮パスワード（以前のパスワードは使えなくなりました）</p>
          <p className="my-1 font-mono text-3xl font-bold tracking-widest">{state.password}</p>
          <p className="muted text-xs">この画面を閉じると再表示できません。ログインは「受講番号」とこのパスワードで行います（携帯番号でログインしている人は携帯番号で）。</p>
        </div>
      )}
    </div>
  );
}
