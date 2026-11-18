'use client';
import { useActionState, useState } from 'react';
import { Button } from '@/components/ui';
import type { InviteResult } from '@/app/admin/trainees/actions';

export function InvitePanel({ issue, name, alreadyActive }: { issue: () => Promise<InviteResult>; name: string; alreadyActive: boolean }) {
  const [state, action, pending] = useActionState<InviteResult>(issue, null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-3">
      <p className="text-sm">
        {alreadyActive
          ? 'すでに利用中です。パスワードを忘れた場合などは、招待URLを再発行すると本人がパスワードを設定し直せます。'
          : '招待URLまたはQRコードを本人に渡してください。開くとパスワードを設定して利用を始められます。'}
        <br />
        有効期限は7日間・1回限りです。再発行すると以前のURLは使えなくなります。
      </p>
      <form action={action}>
        <Button type="submit" disabled={pending}>{pending ? '発行中…' : state && 'url' in state ? '再発行する' : '招待URLを発行'}</Button>
      </form>
      {state && 'error' in state && <p className="font-semibold text-red-700">{state.error}</p>}
      {state && 'url' in state && (
        <div className="space-y-3 rounded-xl border-2 border-dashed border-brand-500 p-4 print:border-0">
          <p className="font-bold">{name} さんの招待</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.qr} alt="招待用QRコード" width={200} height={200} />
          <p className="break-all text-sm">{state.url}</p>
          <p className="muted text-xs">有効期限：{new Date(state.expiresAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</p>
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(state.url);
                setCopied(true);
              }}
            >
              {copied ? 'コピーしました' : 'URLをコピー'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => window.print()}>印刷</Button>
          </div>
          <p className="muted text-xs print:hidden">※この画面を閉じるとURLは再表示できません（必要なら再発行してください）。</p>
        </div>
      )}
    </div>
  );
}
