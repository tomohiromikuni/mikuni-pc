-- =====================================================================
-- 定期実行の設定（Supabase の SQL Editor で実行）
-- 事前に Database > Extensions（または Integrations）で「pg_cron」と「pg_net」を有効にしてください。
-- ★の2か所（アプリのURLと、Vercel に設定した CRON_SECRET）を書き換えてから実行します。
-- 何度実行しても同じ設定に上書きされます。
-- =====================================================================

-- 予約したお知らせを配信（1分ごと）
select cron.schedule('publish-due-announcements', '* * * * *', $$ select public.publish_due_announcements(); $$);

-- 回答期限を過ぎた出欠・アンケートを締め切る（5分ごと）
select cron.schedule('close-due-surveys', '*/5 * * * *', $$ select public.close_due_surveys(); $$);

-- 通知の送信（1分ごと）：アプリの送信処理を呼び出す
select cron.schedule('dispatch-notifications', '* * * * *', $cron$
  select net.http_post(
    url := '★https://mics-pc.vercel.app/api/cron/dispatch',
    headers := jsonb_build_object('Authorization', 'Bearer ★CRON_SECRETの値'),
    timeout_milliseconds := 55000
  );
$cron$);

-- 祝日データの更新（毎月1日 3:00 日本時間 ＝ 前日18:00 UTC）
select cron.schedule('import-holidays', '0 18 28-31 * *', $cron$
  select net.http_post(
    url := '★https://mics-pc.vercel.app/api/cron/holidays',
    headers := jsonb_build_object('Authorization', 'Bearer ★CRON_SECRETの値'),
    timeout_milliseconds := 30000
  ) where extract(day from now() + interval '1 day') = 1;
$cron$);
