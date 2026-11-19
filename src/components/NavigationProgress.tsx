'use client';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * 画面の切り替え中に、いちばん上に細い線を出す（押したのに何も起きないように見えるのを防ぐ）。
 * リンクを押した時点で表示し、次の画面が表示されたら消す。
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(false);
  }, [pathname, search]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setActive(true);
    };
    // フォームの送信（画面が切り替わるもの）でも表示
    const onSubmit = () => setActive(true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('submit', onSubmit, true);
    };
  }, []);

  // 万一切り替わらなかった場合に、いつまでも出したままにしない
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setActive(false), 15000);
    return () => clearTimeout(t);
  }, [active]);

  if (!active) return null;
  return (
    <div role="progressbar" aria-label="読み込み中" className="fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden bg-brand-100 print:hidden">
      <div className="h-full w-1/3 animate-[nav-progress_1s_ease-in-out_infinite] bg-brand-600" />
    </div>
  );
}
