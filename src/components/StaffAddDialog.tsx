'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { addStaff, type AddStaffResult } from '@/app/admin/staff/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { Field } from '@/components/ui';

/** 「＋ スタッフを追加」：名前・メールアドレス・役割だけ入れるポップアップ */
export function StaffAddDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // 開くたびに入力と結果をまっさらにする
  const [round, setRound] = useState(0);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setRound((r) => r + 1);
          ref.current?.showModal();
        }}
        className="inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-4 font-bold text-white hover:brightness-95"
      >
        ＋ スタッフを追加
      </button>
      <dialog
        ref={ref}
        aria-labelledby="add-staff-title"
        className="surface m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border p-0 backdrop:bg-black/40"
        onClick={(e) => e.target === ref.current && ref.current?.close()}
      >
        <AddStaffBody key={round} formRef={formRef} onClose={() => ref.current?.close()} />
      </dialog>
    </>
  );
}

function AddStaffBody({ formRef, onClose }: { formRef: React.RefObject<HTMLFormElement | null>; onClose: () => void }) {
  const [state, action] = useActionState<AddStaffResult, FormData>(addStaff, null);
  const [copied, setCopied] = useState(false);
  const done = state && 'url' in state ? state : null;

  useEffect(() => setCopied(false), [done]);

  if (done) {
    const mail =
      `mailto:${encodeURIComponent(done.email)}?subject=${encodeURIComponent('訓練生ポータルへの招待')}` +
      `&body=${encodeURIComponent(`${done.name} さん\n\n訓練生ポータルの管理画面に招待しました。\n下のURLを開いて、パスワードを決めると使えるようになります（7日以内・1回限り）。\n\n${done.url}\n`)}`;
    return (
      <div className="space-y-4 p-5">
        <h2 id="add-staff-title" className="text-lg font-bold">{done.name} さんを追加しました</h2>
        <p className="text-sm">
          下のURLを本人に送ってください。開いて<strong>パスワードを決めるだけ</strong>で使えるようになります。
          <br />
          <span className="muted text-xs">有効期限は7日間・1回限りです。</span>
        </p>
        <div className="flex gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={done.qr} alt="招待用QRコード" className="h-28 w-28 shrink-0 rounded-lg border" />
          <p className="min-w-0 text-xs break-all">{done.url}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <a href={mail} className="flex min-h-11 items-center justify-center rounded-xl bg-brand-600 font-bold text-white hover:brightness-95">
            メールで送る
          </a>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(done.url);
                setCopied(true);
              } catch {}
            }}
            className="surface min-h-11 rounded-xl border font-bold hover:brightness-95"
          >
            {copied ? 'コピーしました' : 'URLをコピー'}
          </button>
        </div>
        <button type="button" onClick={onClose} className="muted w-full text-sm font-bold underline">
          閉じる
        </button>
      </div>
    );
  }

  return (
    <form ref={formRef} action={action} className="space-y-4 p-5">
      <div className="flex items-center">
        <h2 id="add-staff-title" className="flex-1 text-lg font-bold">スタッフを追加</h2>
        <button type="button" onClick={onClose} aria-label="閉じる" className="muted -mr-2 flex h-10 w-10 items-center justify-center rounded-full text-xl hover:bg-black/5">
          ×
        </button>
      </div>
      {state && 'error' in state && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800">{state.error}</p>}
      <Field label="名前"><input name="full_name" required maxLength={100} autoComplete="off" /></Field>
      <Field label="メールアドレス"><input name="email" type="email" required autoComplete="off" /></Field>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">役割</legend>
        <div className="grid gap-2">
          <label className="line flex items-start gap-2 rounded-xl border p-3 font-normal has-checked:border-brand-600 has-checked:bg-brand-50">
            <input type="radio" name="role" value="staff" defaultChecked className="mt-0.5" />
            <span><strong>メンバー</strong><span className="muted block text-xs">削除とスタッフの管理以外は、すべて使えます</span></span>
          </label>
          <label className="line flex items-start gap-2 rounded-xl border p-3 font-normal has-checked:border-brand-600 has-checked:bg-brand-50">
            <input type="radio" name="role" value="admin" className="mt-0.5" />
            <span><strong>管理者</strong><span className="muted block text-xs">すべての機能が使えます</span></span>
          </label>
        </div>
      </fieldset>
      <SubmitButton className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 font-bold text-white hover:brightness-95">追加して招待URLを作る</SubmitButton>
    </form>
  );
}
