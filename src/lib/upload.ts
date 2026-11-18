'use client';
import { createClient } from '@/lib/supabase/browser';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ACCEPT = 'image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv';

/** 画像を長辺1600pxまで縮小（通信量と保存容量を節約）。縮小できない形式はそのまま */
export async function compressImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 300 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

function ext(name: string) {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name);
  return m ? m[1].toLowerCase() : 'bin';
}

/**
 * ファイルを保存して添付情報を登録する。
 * folder: 'announcements/<id>' または 'chat/<roomId>'
 */
export async function uploadAttachment(
  original: File,
  opts: { orgId: string; folder: string; kind: 'announcement' | 'chat'; announcementId?: string; messageId?: string },
): Promise<{ error?: string }> {
  const file = await compressImage(original);
  if (file.size > MAX_FILE_BYTES) return { error: `${original.name}：10MBを超えるファイルは送れません` };
  const supabase = createClient();
  const path = `${opts.folder}/${crypto.randomUUID()}.${ext(file.name)}`;
  const type = file.type || 'application/octet-stream';
  const { error: upErr } = await supabase.storage.from('attachments').upload(path, file, { contentType: type, upsert: false });
  if (upErr) return { error: `${original.name}：アップロードできませんでした（${upErr.message}）` };
  const { error } = await supabase.from('attachments').insert({
    org_id: opts.orgId,
    kind: opts.kind,
    announcement_id: opts.announcementId ?? null,
    message_id: opts.messageId ?? null,
    storage_path: path,
    file_name: original.name.slice(0, 200),
    mime_type: type,
    size_bytes: file.size,
  });
  if (error) {
    await supabase.storage.from('attachments').remove([path]);
    return { error: `${original.name}：登録できませんでした（${error.message}）` };
  }
  return {};
}
