'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { finalizeAnnouncement, saveAnnouncementDraft } from '@/app/admin/announcements/actions';
import { FilePicker } from '@/components/FilePicker';
import { Button, Card } from '@/components/ui';
import { uploadAttachment } from '@/lib/upload';

/** お知らせ作成フォーム：保存 → 添付をアップロード → 配信 の順に行う */
export function AnnouncementComposer({ fields, targets, timing }: { fields: ReactNode; targets: ReactNode; timing: ReactNode }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    setBusy('保存しています…');
    const draft = await saveAnnouncementDraft(fd);
    if ('error' in draft) {
      setError(draft.error);
      setBusy(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const failed: string[] = [];
    for (const [i, f] of files.entries()) {
      setBusy(`ファイルを送信中…（${i + 1}/${files.length}）`);
      const r = await uploadAttachment(f, { orgId: draft.orgId, folder: `announcements/${draft.id}`, kind: 'announcement', announcementId: draft.id });
      if (r.error) failed.push(r.error);
    }
    if (failed.length) {
      // 添付に失敗したら配信せず、下書きのまま詳細画面へ
      router.push(`/admin/announcements/${draft.id}?error=` + encodeURIComponent('添付に失敗したため下書きで保存しました：' + failed.join(' / ')));
      return;
    }
    setBusy('配信しています…');
    const r = await finalizeAnnouncement(draft.id, String(fd.get('mode')), String(fd.get('publish_at') ?? ''));
    router.push(r.url ?? `/admin/announcements/${draft.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 font-semibold text-red-800">{error}</p>}
      <Card className="space-y-4">
        {fields}
        <FilePicker files={files} onChange={setFiles} disabled={!!busy} />
      </Card>
      {targets}
      {timing}
      <Button type="submit" disabled={!!busy} className="w-full sm:w-auto">{busy ?? '保存・配信する'}</Button>
    </form>
  );
}
