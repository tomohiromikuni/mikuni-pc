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
      <aside className="surface relative hidden border-r print:hidden md:sticky md:top-0 md:block md:h-dvh md:w-60 md:shrink-0">
        <div className="px-4 py-3">
          <p className="font-bold text-brand-700">{env.appName}</p>
          <p className="muted text-xs">管理画面・{me.full_name}（{roleLabel}）</p>
          <form action="/auth/signout" method="post" className="mt-2">
            <button className="muted text-sm underline">ログアウト</button>
          </form>
        </div>
        <div className="px-2 pb-2">
          <AdminNav isAdmin={me.role === 'admin'} />
          <a
            href={me.also_trainee ? '/home' : '/admin/trainee-mode'}
            className="mt-2 flex items-center justify-center gap-1 rounded-xl border-2 border-dashed border-brand-500 px-3 py-2 text-sm font-bold text-brand-700 hover:bg-brand-50"
          >
            訓練生モードに切り替え
          </a>
        </div>
        <p className="muted absolute bottom-0 px-4 pb-3 text-xs" title="アプリのバージョン">
          バージョン {process.env.NEXT_PUBLIC_APP_VERSION}
          {process.env.NEXT_PUBLIC_BUILD_ID && <span className="ml-1 opacity-70">({process.env.NEXT_PUBLIC_BUILD_ID})</span>}
        </p>
      </aside>
      <AdminMain>{children}</AdminMain>
      <AdminBottomNav initialReply={reply} canChat={canChat} />
    </div>
  );
}
