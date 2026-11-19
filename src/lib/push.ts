import 'server-only';
import webpush from 'web-push';
import { env } from '@/lib/env';
import { allowedForGraduate, hasFinished } from '@/lib/completion';
import { digestText, isQuietTime, nextAllowedTime } from '@/lib/quiet-hours';
import { createAdminClient } from '@/lib/supabase/admin';

type Row = { id: string; org_id: string; user_id: string; kind: string; title: string; body: string; url: string; ignore_quiet: boolean };

/**
 * 送信待ちの通知を送る（1分ごとに呼ばれる）
 *  - 訓練生：通知禁止時間なら、次の通知可能時刻（朝7時）まで保留
 *  - 同じ人に複数あれば1通にまとめる
 *  - 届かなくなった端末（解約・アンインストール）は自動で削除
 */
export async function dispatchDue(now = new Date()) {
  const db = createAdminClient();
  webpush.setVapidDetails(env.vapidSubject(), env.vapidPublicKey(), env.vapidPrivateKey());

  const { data: rows } = await db
    .from('notification_queue')
    .select('id, org_id, user_id, kind, title, body, url, ignore_quiet')
    .is('sent_at', null)
    .lte('send_after', now.toISOString())
    .order('created_at')
    .limit(1000);
  if (!rows?.length) return { sent: 0, deferred: 0, users: 0 };

  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const orgIds = [...new Set(rows.map((r) => r.org_id))];
  const [{ data: profiles }, { data: days }, { data: subs }] = await Promise.all([
    db
      .from('profiles')
      .select('id, role, status, also_trainee, trainee_details(expected_completion_on), enrollments(ended_on, classes(courses(archived, ends_on)))')
      .in('id', userIds),
    db.from('calendar_days').select('org_id, day').in('org_id', orgIds),
    db.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', userIds),
  ]);
  const offDays = new Map<string, Set<string>>();
  for (const d of days ?? []) (offDays.get(d.org_id) ?? offDays.set(d.org_id, new Set()).get(d.org_id)!).add(d.day);

  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(now);
  let sent = 0;
  let deferred = 0;
  const byUser = new Map<string, Row[]>();
  for (const r of rows as Row[]) (byUser.get(r.user_id) ?? byUser.set(r.user_id, []).get(r.user_id)!).push(r);

  for (const [userId, items] of byUser) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prof = profiles?.find((p) => p.id === userId) as any;
    const ids = items.map((i) => i.id);
    // 受講が終わった訓練生には送らない（アプリ内のお知らせは残る）
    const cur = prof?.enrollments?.find((e: { ended_on: string | null }) => !e.ended_on);
    const finished =
      prof?.role === 'trainee' &&
      hasFinished(
        {
          courseArchived: cur?.classes?.courses?.archived,
          courseEndsOn: cur?.classes?.courses?.ends_on,
          expectedCompletionOn: prof?.trainee_details?.expected_completion_on,
        },
        today,
      );
    if (!prof || prof.status !== 'active') {
      await db.from('notification_queue').update({ sent_at: now.toISOString() }).in('id', ids); // 送らずに片付け
      continue;
    }
    // 修了生：就職状況の確認などの依頼だけ送り、ほかは送らずに片付ける
    let candidates = items;
    if (finished) {
      const skip = items.filter((i) => !allowedForGraduate(i));
      if (skip.length) await db.from('notification_queue').update({ sent_at: now.toISOString() }).in('id', skip.map((i) => i.id));
      candidates = items.filter(allowedForGraduate);
      if (!candidates.length) continue;
    }
    const off = offDays.get(items[0].org_id) ?? new Set<string>();
    let toSend = candidates;
    if (prof.role === 'trainee' && isQuietTime(now, off)) {
      const later = candidates.filter((i) => !i.ignore_quiet);
      toSend = candidates.filter((i) => i.ignore_quiet);
      if (later.length) {
        await db.from('notification_queue').update({ send_after: nextAllowedTime(now, off).toISOString() }).in('id', later.map((i) => i.id));
        deferred += later.length;
      }
    }
    if (!toSend.length) continue;

    const payload =
      toSend.length === 1
        ? { title: toSend[0].title, body: toSend[0].body, url: toSend[0].url }
        : { title: env.appName, body: digestText(toSend.map((i) => i.kind)), url: prof.role === 'trainee' ? '/home' : '/admin' };
    for (const s of (subs ?? []).filter((x) => x.user_id === userId)) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 24, urgency: 'high' });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('id', s.id);
      }
    }
    await db.from('notification_queue').update({ sent_at: now.toISOString() }).in('id', toSend.map((i) => i.id));
    sent += toSend.length;
  }
  return { sent, deferred, users: byUser.size };
}
