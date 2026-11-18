import { AuthShell } from '@/components/AuthShell';
import { Button } from '@/components/ui';

export default function SuspendedPage() {
  return (
    <AuthShell title="アカウントは利用停止中です">
      <p>現在このアカウントは利用できません。ご不明な点は事務局までお問い合わせください。</p>
      <form action="/auth/signout" method="post">
        <Button type="submit" variant="secondary" className="w-full">ログアウト</Button>
      </form>
    </AuthShell>
  );
}
