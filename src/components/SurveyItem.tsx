import Link from 'next/link';
import { friendlyDateTime } from '@/lib/format';
import type { MySurvey } from '@/lib/trainee-surveys';

export function SurveyItem({ s }: { s: MySurvey }) {
  return (
    <li>
      <Link href={`/answers/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:brightness-95">
        <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${s.kind === 'attendance' ? 'bg-sky-100 text-sky-800' : 'bg-violet-100 text-violet-800'}`}>
          {s.kind === 'attendance' ? '出欠' : 'アンケート'}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate ${!s.responded_at && s.open ? 'font-bold' : ''}`}>{s.title}</span>
          <span className="muted block text-xs">
            {s.responded_at ? `回答済み（${friendlyDateTime(s.responded_at)}）` : s.open ? (s.due_at ? `期限 ${friendlyDateTime(s.due_at)}` : '期限なし') : '受付終了'}
          </span>
        </span>
        {!s.responded_at && s.open && <span className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">未回答</span>}
      </Link>
    </li>
  );
}
