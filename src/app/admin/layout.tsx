import { AdminBottomNav, AdminMain, AdminMobileHeader } from '@/components/AdminMobile';
import { AdminNav } from '@/components/AdminNav';
import { hasPerm, requireStaff } from '@/lib/auth';
import { env } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

/** 管理画面の枠：PCは左メニュー、スマホは上の帯＋下のタブ */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff();
  const canChat = await hasPerm('chat');
  let reply = 0;
  if (canChat) {
    const supabase = await createClient();
    const { data } = await supabase.from('chat_rooms').select('last_message_at, chat_reads(user_id, last_read_at)').eq('last_sender_role', 'trainee');
    reply = (data ?? []).filter((r) => {
      const mine = (r.chat_reads ?? []).find((x: { user_id: string }) => x.user_id === me.id)?.last_read_at;
      return !mine || mine < (r.last_message_at ?? '');
    }).length;
  }
  const roleLabel = me.role === 'admin' ? '管理者' : 'スタッフ';

  return (
    <div className="min-h-dvh md:flex">
      <AdminMobileHeader name={me.full_name} roleLabel={roleLabel} />
      <aside className="surface hidden border-r print:hidden md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col">
        {/* 左上：アプリのアイコン＋名前（デザイン案A） */}
        <a href="/admin" className="flex items-center gap-2.5 px-4 pt-[18px] pb-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-brand-600 text-white" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v11H9l-5 4z" /></svg>
          </span>
          <span className="min-w-0">
            <span className="block truncate text-base leading-tight font-bold">{env.appName}</span>
            <span className="muted block text-[11px]">管理画面</span>
          </span>
        </a>
        <div className="min-h-0 flex-1 overflow-y-auto px-2.5">
          <AdminNav />
        </div>
        <div className="line space-y-2.5 border-t p-3">
          <a
            href="/preview"
            className="flex items-center justify-center rounded-xl border-2 border-dashed border-brand-500 px-3 py-2 text-sm font-bold text-brand-700 hover:bg-brand-50"
          >
            訓練生の画面を見る
          </a>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700" aria-hidden>
              {me.full_name.slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-bold">{me.full_name}</span>
              <span className="muted block truncate text-[11px]" title="アプリのバージョン">
                {roleLabel}・バージョン {process.env.NEXT_PUBLIC_APP_VERSION}
                {process.env.NEXT_PUBLIC_BUILD_ID && ` (${process.env.NEXT_PUBLIC_BUILD_ID})`}
              </span>
            </span>
            <form action="/auth/signout" method="post">
              <button className="muted min-h-8 text-xs underline">ログアウト</button>
            </form>
          </div>
        </div>
      </aside>
      <AdminMain>{children}</AdminMain>
      <AdminBottomNav initialReply={reply} canChat={canChat} />
    </div>
  );
}
