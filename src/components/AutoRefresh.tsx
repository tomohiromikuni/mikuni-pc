'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** 画面を開いている間、一定間隔で最新の内容に更新する（一覧画面用） */
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && router.refresh(), seconds * 1000);
    const onVisible = () => document.visibilityState === 'visible' && router.refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router, seconds]);
  return null;
}
