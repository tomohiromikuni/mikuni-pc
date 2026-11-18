import type { AttachmentView } from '@/lib/attachments';
import { formatBytes } from '@/lib/attachments';

/** 画像はその場に表示、それ以外はダウンロード用のリンク */
export function AttachmentList({ items }: { items: AttachmentView[] }) {
  if (items.length === 0) return null;
  const images = items.filter((a) => a.mime_type.startsWith('image/') && a.url);
  const files = items.filter((a) => !images.includes(a));
  return (
    <div className="space-y-3">
      {images.map((a) => (
        <a key={a.id} href={a.url!} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.url!} alt={a.file_name} className="max-h-[70dvh] w-auto max-w-full rounded-xl border line" />
        </a>
      ))}
      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((a) => (
            <li key={a.id}>
              <a
                href={a.url ?? '#'}
                target="_blank"
                rel="noreferrer"
                className="surface flex items-center gap-3 rounded-xl border px-4 py-3 hover:brightness-95"
              >
                <span aria-hidden className="rounded-md bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white">
                  {a.mime_type === 'application/pdf' ? 'PDF' : 'FILE'}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">{a.file_name}</span>
                <span className="muted shrink-0 text-xs">{formatBytes(a.size_bytes)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
