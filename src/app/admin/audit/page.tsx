import { Card, PageTitle } from '@/components/ui';
import { requireAdmin } from '@/lib/auth';
import { friendlyDateTime } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

const ACTION_LABEL: Record<string, string> = {
  'trainee.view_pii': '訓練生の連絡先を閲覧',
  'trainee.import': '一括登録',
  'trainee.auto_suspend': '修了後の自動停止',
  'survey.export_csv': 'アンケート結果をCSV出力',
  'invite.issue': '招待URLを発行',
  'profile.change': '役割・利用状態の変更',
  'staff.mfa_reset': '2段階認証のリセット',
  'staff_permissions.insert': '権限を付与',
  'staff_permissions.delete': '権限を解除',
  'staff_scopes.insert': '担当範囲を追加',
  'staff_scopes.delete': '担当範囲を解除',
};

export default async function AuditPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from('audit_logs')
    .select('id, action, detail, created_at, target_id, actor:profiles!audit_logs_actor_id_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(300);
  return (
    <div className="space-y-4">
      <PageTitle>操作ログ</PageTitle>
      <p className="text-sm">個人情報の閲覧・出力、権限や利用状態の変更などを記録しています（最新300件）。</p>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="muted"><tr className="border-b line"><th className="px-3 py-2">日時</th><th className="px-3 py-2">操作した人</th><th className="px-3 py-2">内容</th><th className="px-3 py-2">対象</th></tr></thead>
          <tbody className="divide-y line">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(data ?? []).map((l: any) => (
              <tr key={l.id}>
                <td className="px-3 py-2 whitespace-nowrap">{friendlyDateTime(l.created_at)}</td>
                <td className="px-3 py-2">{l.actor?.full_name ?? '（自動）'}</td>
                <td className="px-3 py-2">{ACTION_LABEL[l.action] ?? l.action}</td>
                <td className="px-3 py-2">{l.detail?.name ?? l.detail?.title ?? l.detail?.file ?? ''}</td>
              </tr>
            ))}
            {(data ?? []).length === 0 && <tr><td colSpan={4} className="muted px-3 py-6 text-center">記録はまだありません</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
