'use client';
import { useEffect, useRef, useState } from 'react';

/** 左メニュー上の「ログイン中の人」（デザイン案A）：押すとログアウトのメニューが開く */
export function UserMenu({ name, roleLabel }: { name: string; roleLabel: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // 外を押す・Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative mx-2 mb-2">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-xl bg-black/[0.03] p-2 text-left hover:bg-black/[0.06]"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700" aria-hidden>
          {name.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{name}</span>
          <span className="muted block text-[11px]">{roleLabel}</span>
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="surface line absolute inset-x-1 top-full z-30 mt-1 rounded-xl border p-1.5 shadow-[0_8px_24px_rgba(31,42,38,0.14)]">
          <form action="/auth/signout" method="post">
            <button role="menuitem" className="min-h-11 w-full rounded-lg px-3 text-left font-bold text-red-700 hover:bg-red-50">
              ログアウト
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
