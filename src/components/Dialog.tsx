'use client';
import { useRef, type ReactNode } from 'react';

/** ボタンを押すと開くポップアップ（中身はサーバー側で作ったフォームでもよい） */
export function Dialog({ label, title, buttonClassName, children }: { label: ReactNode; title: string; buttonClassName?: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={buttonClassName}>
        {label}
      </button>
      <dialog
        ref={ref}
        aria-label={title}
        className="surface m-auto max-h-[calc(100dvh-2rem)] w-[min(40rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border p-0 backdrop:bg-black/40"
        onClick={(e) => e.target === ref.current && ref.current?.close()}
      >
        <div className="surface sticky top-0 z-10 flex items-center border-b px-5 py-3">
          <h2 className="flex-1 text-lg font-bold">{title}</h2>
          <button type="button" onClick={() => ref.current?.close()} aria-label="閉じる" className="muted -mr-2 flex h-10 w-10 items-center justify-center rounded-full text-xl hover:bg-black/5">
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </dialog>
    </>
  );
}
