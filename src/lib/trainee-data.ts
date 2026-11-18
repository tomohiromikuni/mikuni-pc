import 'server-only';
import { getMe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { Priority } from '@/lib/types';

export type TraineeAnnouncement = {
  id: string;
  title: string;
  body: string;
  priority: Priority;
  published_at: string;
  edited_at: string | null;
  category: string | null;
  read: boolean;
  attachmentCount: number;
};

/** 自分あての配信済みお知らせ（権限ルールにより自分あてのものだけが返る） */
export async function listMyAnnouncements(opts: { limit?: number; categoryId?: string } = {}) {
  const supabase = await createClient();
  let q = supabase
    .from('announcements')
    .select('id, title, body, priority, published_at, edited_at, category_id, announcement_categories(name), announcement_recipients(read_at), attachments(id)')
    .eq('status', 'published')
    .order('published_at', { ascending: false });
  if (opts.categoryId) q = q.eq('category_id', opts.categoryId);
  if (opts.limit) q = q.limit(opts.limit);
  const { data } = await q;
  return (data ?? []).map(toItem);
}

export async function countUnread(): Promise<number> {
  const [supabase, user] = await Promise.all([createClient(), getMe()]);
  if (!user) return 0;
  const { count } = await supabase
    .from('announcement_recipients')
    .select('announcement_id', { count: 'exact', head: true })
    .eq('trainee_id', user.id)
    .is('read_at', null);
  return count ?? 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toItem(a: any): TraineeAnnouncement {
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    priority: a.priority,
    published_at: a.published_at,
    edited_at: a.edited_at,
    category: a.announcement_categories?.name ?? null,
    read: Boolean(a.announcement_recipients?.[0]?.read_at),
    attachmentCount: a.attachments?.length ?? 0,
  };
}
