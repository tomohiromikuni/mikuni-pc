import Link from 'next/link';
import { UnreadDot } from '@/components/ui';
import { friendlyDateTime } from '@/lib/format';
import type { TraineeAnnouncement } from '@/lib/trainee-data';

export function AnnouncementList({ items, empty = 'お知らせはまだありません' }: { items: TraineeAnnouncement[]; empty?: string }) {
  if (items.length === 0) return <p className="muted py-6 text-center">{empty}</p>;
  return (
    <ul className="surface divide-y line overflow-hidden rounded-2xl border">
      {items.map((a) => (
        <li key={a.id}>
          <Link href={`/announcements/${a.id}`} className="flex items-start gap-3 px-4 py-3 hover:brightness-95">
            <span className="mt-2 w-2.5">{!a.read && <UnreadDot />}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className={`min-w-0 flex-1 truncate ${a.read ? '' : 'font-bold'}`}>{a.title}</span>
                {a.attachmentCount > 0 && <span className="muted shrink-0 text-xs" aria-label="添付あり">📎{a.attachmentCount}</span>}
              </span>
              <span className="muted block text-xs">{friendlyDateTime(a.published_at)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
