import { Card, PageTitle } from '@/components/ui';

export default function ChatPage() {
  return (
    <div>
      <PageTitle>事務局チャット</PageTitle>
      <Card>
        <p>チャット機能は準備中です（開発段階3で追加予定）。</p>
        <p className="muted mt-2 text-sm">ご用件は、これまでどおり事務局までご連絡ください。</p>
      </Card>
    </div>
  );
}
