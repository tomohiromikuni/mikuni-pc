-- 予約配信を1分ごとに実行する設定（Supabase の SQL Editor で1回だけ実行）
-- 事前に Database > Extensions で「pg_cron」を有効にしてください。
select cron.schedule('publish-due-announcements', '* * * * *', $$ select public.publish_due_announcements(); $$);
