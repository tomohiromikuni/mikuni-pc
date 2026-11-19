import Link from 'next/link';
import { formatDate } from '@/lib/format';
import type { MyStatus } from '@/lib/my-status';

/** 修了生のホーム（デザイン案C：1画面だけ・タブなし） */
export function GraduateHome({ name, status, report }: { name: string; status: MyStatus; report: { id: string; title: string } | null }) {
  return (
    <div className="flex min-h-dvh flex-col gap-4 bg-[#f7f3ec] px-5 pt-[calc(1.75rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-[#2b2622]">
      <div className="text-center">
        <p className="text-sm text-[#5c534b]">修了生</p>
        <p className="mt-1 text-2xl font-bold">{name} さん</p>
      </div>

      <section className="rounded-[22px] bg-white p-5 text-center shadow-[0_1px_3px_rgba(43,38,34,0.1)]">
        <p className="text-[13px] text-[#5c534b]">受講記録</p>
        <p className="mt-1 text-xl font-bold">{status.courseName ?? '—'}</p>
        <p className="mt-1 text-[15px]">
          {formatDate(status.startsOn)} 〜 {formatDate(status.endsOn)}（修了）
        </p>
      </section>

      {report ? (
        <Link href={`/answers/${report.id}`} className="flex min-h-[76px] items-center justify-center gap-2.5 rounded-[22px] bg-amber-500 px-4 text-center text-[19px] font-bold text-[#2b2622]">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 4h6l1 2h3v15H5V6h3zM9 12l2 2 4-4" /></svg>
          {report.title.includes('就職') ? '就職状況を報告する' : report.title}
        </Link>
      ) : (
        <p className="rounded-[22px] bg-white/70 px-4 py-3 text-center text-sm text-[#5c534b]">いま事務局へのご報告は必要ありません</p>
      )}

      <Link href="/chat" className="flex min-h-[76px] items-center justify-center gap-2.5 rounded-[22px] bg-brand-600 text-[19px] font-bold text-white">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 4h16v12H9l-5 4z" /></svg>
        事務局に相談する
      </Link>

      <div className="mt-auto flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm font-bold">
        <Link href="/announcements" className="text-brand-700">過去のお知らせ</Link>
        <Link href="/password" className="text-brand-700">パスワード変更</Link>
        <form action="/auth/signout" method="post"><button className="text-brand-700">ログアウト</button></form>
      </div>
      {status.usableUntil && <p className="text-center text-xs text-[#5c534b]">このアプリは {formatDate(status.usableUntil)} まで使えます</p>}
    </div>
  );
}
