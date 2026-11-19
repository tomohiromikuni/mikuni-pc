import { AutoRefresh } from '@/components/AutoRefresh';
import { PushSetup } from '@/components/PushSetup';
import { Notice } from '@/components/ui';
import { requirePerm } from '@/lib/auth';
import { env } from '@/lib/env';
import { ChatListPane } from './ChatListPane';

/** 学校側のチャット（デザイン案B：PCでは左に一覧・右にトーク。スマホは一覧だけ） */
export default async function ChatList({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; message?: string; view?: string }> }) {
  const me = await requirePerm('chat');
  const sp = await searchParams;
  return (
    <div className="space-y-3">
      <AutoRefresh seconds={10} />
      <h1 className="text-xl font-bold md:hidden">チャット</h1>
      <Notice error={sp.error} message={sp.message} />
      {/* この端末で通知を受け取っていなければ案内（受け取り中なら表示しない） */}
      <PushSetup vapidKey={env.vapidPublicKey()} compact audience="staff" />
      <div className="md:grid md:h-[calc(100dvh-3rem)] md:grid-cols-[340px_minmax(0,1fr)] md:gap-4">
        <section aria-label="チャット一覧" className="surface overflow-hidden rounded-2xl border md:h-full">
          <ChatListPane meId={me.id} view={sp.view === 'done' ? 'done' : 'current'} q={(sp.q ?? '').trim()} />
        </section>
        <div className="line hidden items-center justify-center rounded-2xl border-2 border-dashed md:flex">
          <p className="muted text-sm">左の一覧から相手を選んでください</p>
        </div>
      </div>
    </div>
  );
}
