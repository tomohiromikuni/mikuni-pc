'use client';
import type { ComponentProps } from 'react';
import { useFormStatus } from 'react-dom';

/** 送信ボタン：押した瞬間に「処理中…」を表示し、終わるまで押せなくする（二度押し防止） */
export function SubmitButton({ children, disabled, className = '', ...props }: ComponentProps<'button'>) {
  const { pending } = useFormStatus();
  return (
    <button {...props} type="submit" disabled={disabled || pending} aria-busy={pending} className={`${className} ${pending ? 'cursor-wait opacity-80' : ''}`}>
      {pending ? (
        <>
          <span aria-hidden className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          処理中…
        </>
      ) : (
        children
      )}
    </button>
  );
}
