import { redirect } from 'next/navigation';
import { type Flash } from '@/components/ui';
import { hasPerm, requireStaff } from '@/lib/auth';

/** 管理画面を開いたら、まずチャットを表示する（ダッシュボードは使わない） */
export default async function AdminTop({ searchParams }: { searchParams: Promise<Flash> }) {
  await requireStaff();
  const { error, message } = await searchParams;
  const q = new URLSearchParams();
  if (error) q.set('error', error);
  if (message) q.set('message', message);
  const qs = q.size ? `?${q}` : '';
  if (await hasPerm('chat')) redirect(`/admin/chat${qs}`);
  if (await hasPerm('announce')) redirect(`/admin/announcements${qs}`);
  redirect(`/admin/settings${qs}`);
}
