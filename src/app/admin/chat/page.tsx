import Link from 'next/link';
import { AutoRefresh } from '@/components/AutoRefresh';
import { Card, Notice, PageTitle } from '@/components/ui';
import { requirePerm } from '@/lib/auth';
import { CHAT_STATUS_LABEL, type ChatStatus } from '@/lib/chat';
import { friendlyDateTime } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

const TABS: [string, string][] = [['open', '未対応'], ['in_progress', '対応中'], ['done', '完了'], ['all', 'すべて']];
const STATUS_COLOR: Record<ChatStatus, string> = {
  open: 'bg-red-100 text-red-800',
  in_progress: 'bg-amber-100 text-amber-900',
  done: 'bg-gray-200 text-gray-700',
};

export default async function ChatInbox({ searchParams }: { searchParams: Promise<{ tab?: string; error?: string }> }) {
  const me = await requirePerm('chat');
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : 'open';
  const supabase = await createClient();
  let q = supabase
    .from('chat_rooms')
    .select('id, status, last_message_at, last_sender_role, trainee_id, profiles!chat_rooms_trainee_id_fkey(full_name, full_name_kana), chat_reads(user_id, last_read_at), chat_messages(body, created_at)')
    .not('last_message_at', 'is', null)
    .order('last_message_at', { ascending: false })
    .order('created_at', { referencedTable: 'chat_messages', ascending: false })
    .limit(1, { referencedTable: 'chat_messages' })
    .limit(200);
  if (tab !== 'all') q = q.eq('status', tab);
  const { data } = await q;

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={10} />
      <PageTitle>チャット（事務局窓口）</PageTitle>
      <Notice error={sp.error} />
      <div className="flex flex-wrap gap-2">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/admin/chat?tab=${k}`} className={`rounded-full border px-4 py-1.5 text-sm font-bold ${tab === k ? 'border-brand-600 bg-brand-600 text-white' : 'surface'}`}>{label}</Link>
        ))}
      </div>
      <Card className="p-0">
        <ul className="divide-y line">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(data ?? []).map((r: any) => {
            const myRead = r.chat_reads?.find((x: { user_id: string }) => x.user_id === me.id)?.last_read_at;
            const unread = r.last_sender_role === 'trainee' && (!myRead || myRead < r.last_message_at);
            const last = r.chat_messages?.[0];
            return (
              <li key={r.id}>
                <Link href={`/admin/chat/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-black/5">
                  <span className={`w-14 shrink-0 rounded-md px-1.5 py-0.5 text-center text-xs font-bold ${STATUS_COLOR[r.status as ChatStatus]}`}>{CHAT_STATUS_LABEL[r.status as ChatStatus]}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block ${unread ? 'font-bold' : ''}`}>
                      {r.profiles?.full_name}
                      {r.last_sender_role === 'trainee' && <span className="ml-2 text-xs font-bold text-red-700">要返信</span>}
                    </span>
                    <span className="muted block truncate text-sm">{last?.body || '（ファイル）'}</span>
                  </span>
                  <span className="muted shrink-0 text-xs">{friendlyDateTime(r.last_message_at)}</span>
                  {unread && <span aria-label="未読" className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />}
                </Link>
              </li>
            );
          })}
          {(data ?? []).length === 0 && <li className="muted p-6 text-center">ありません</li>}
        </ul>
      </Card>
      <p className="muted text-xs">表示されるのは、あなたの担当範囲の訓練生だけです。訓練生の詳細画面から新しくチャットを始めることもできます。</p>
    </div>
  );
}
