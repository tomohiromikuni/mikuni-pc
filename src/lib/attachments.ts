import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type AttachmentView = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  url: string | null;
};

/** 添付ファイルに、10分間だけ有効な閲覧用URLを付ける（権限ルールで見られないものはURLが付かない） */
export async function withSignedUrls<T extends { storage_path: string }>(rows: T[]): Promise<(T & { url: string | null })[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase.storage.from('attachments').createSignedUrls(rows.map((r) => r.storage_path), 600);
  const map = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return rows.map((r) => ({ ...r, url: map.get(r.storage_path) ?? null }));
}

export async function listAnnouncementAttachments(announcementId: string): Promise<AttachmentView[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('attachments')
    .select('id, file_name, mime_type, size_bytes, storage_path')
    .eq('announcement_id', announcementId)
    .order('created_at');
  return withSignedUrls(data ?? []);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
