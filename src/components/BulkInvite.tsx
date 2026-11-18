'use client';
import { useActionState, useState } from 'react';
import { issueInvites, type BulkInviteResult } from '@/app/admin/trainees/actions';
import { Button, Card } from '@/components/ui';

type Person = { id: string; name: string; label: string; status: string };

export function BulkInvite({ people, appName }: { people: Person[]; appName: string }) {
  const [state, action, pending] = useActionState<BulkInviteResult, FormData>(issueInvites, null);
  const [checked, setChecked] = useState<Set<string>>(new Set(people.filter((p) => p.status === 'invited').map((p) => p.id)));

  if (state && state.cards.length > 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <p className="font-bold">{state.cards.length}人分の招待を発行しました。印刷して配布してください（有効期限7日・1回限り）。</p>
          <Button onClick={() => window.print()}>印刷する</Button>
        </div>
        {state.errors.length > 0 && <p className="text-red-700 print:hidden">{state.errors.join(' / ')}</p>}
        <p className="muted text-sm print:hidden">※この画面を閉じるとURLは再表示できません。必要なら再発行してください（以前のURLは無効になります）。</p>
        <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-2 print:gap-2">
          {state.cards.map((c) => (
            <div key={c.id} className="break-inside-avoid rounded-xl border-2 border-dashed border-gray-400 bg-white p-4 text-black">
              <p className="text-sm">{appName}　ご招待</p>
              <p className="text-xl font-bold">{c.name} さん</p>
              <div className="mt-2 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.qr} alt="" width={140} height={140} />
                <ol className="list-decimal pl-4 text-xs leading-relaxed">
                  <li>スマホのカメラでQRコードを読み取る</li>
                  <li>パスワードを決めて登録</li>
                  <li>ホーム画面に追加すると便利です</li>
                </ol>
              </div>
              <p className="mt-2 text-[10px] break-all">{c.url}</p>
              <p className="text-[10px]">有効期限：{new Date(c.expiresAt).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })}まで</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const toggle = (id: string) => setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <form action={action} className="space-y-4">
      {state?.errors.length ? <p className="text-red-700">{state.errors.join(' / ')}</p> : null}
      <Card className="p-0">
        <div className="flex items-center gap-3 border-b line px-4 py-2 text-sm">
          <button type="button" className="text-brand-700 underline" onClick={() => setChecked(new Set(people.map((p) => p.id)))}>すべて選択</button>
          <button type="button" className="text-brand-700 underline" onClick={() => setChecked(new Set())}>選択を解除</button>
          <span className="muted ml-auto">{checked.size}人を選択中</span>
        </div>
        <ul className="divide-y line">
          {people.map((p) => (
            <li key={p.id}>
              <label className="flex items-center gap-3 px-4 py-2 font-normal">
                <input type="checkbox" name="id" value={p.id} checked={checked.has(p.id)} onChange={() => toggle(p.id)} />
                <span className="flex-1">{p.name}</span>
                <span className="muted text-sm">{p.label}</span>
                <span className="muted text-xs">{p.status === 'active' ? '利用中（再発行）' : '招待中'}</span>
              </label>
            </li>
          ))}
          {people.length === 0 && <li className="muted p-4">対象の訓練生がいません</li>}
        </ul>
      </Card>
      <Button type="submit" disabled={pending || checked.size === 0}>{pending ? '発行中…' : `${checked.size}人分の招待QRを発行`}</Button>
    </form>
  );
}
