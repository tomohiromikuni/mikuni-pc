'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FilePicker } from '@/components/FilePicker';
import { Button } from '@/components/ui';
import type { AttachmentView } from '@/lib/attachments';
import { createClient } from '@/lib/supabase/browser';
import { uploadAttachment } from '@/lib/upload';

/** お知らせ詳細（管理）：添付の追加・削除 */
export function AttachmentManager({ items, orgId, announcementId }: { items: AttachmentView[]; orgId: string; announcementId: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    const errs: string[] = [];
    for (const f of files) {
      const r = await uploadAttachment(f, { orgId, folder: `announcements/${announcementId}`, kind: 'announcement', announcementId });
      if (r.error) errs.push(r.error);
    }
    setFiles([]);
    setBusy(false);
    if (errs.length) setError(errs.join(' / '));
    router.refresh();
  }

  async function remove(a: AttachmentView) {
    if (!confirm(`「${a.file_name}」を削除しますか？`)) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.storage.from('attachments').remove([a.storage_path]);
    await supabase.from('attachments').delete().eq('id', a.id);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-3 text-sm">
              <a href={a.url ?? '#'} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-brand-700 underline">{a.file_name}</a>
              <button type="button" onClick={() => remove(a)} disabled={busy} className="text-red-700 underline">削除</button>
            </li>
          ))}
        </ul>
      )}
      <FilePicker files={files} onChange={setFiles} disabled={busy} />
      {files.length > 0 && <Button type="button" onClick={add} disabled={busy}>{busy ? '送信中…' : '添付を追加'}</Button>}
      {error && <p className="font-semibold text-red-700">{error}</p>}
    </div>
  );
}
