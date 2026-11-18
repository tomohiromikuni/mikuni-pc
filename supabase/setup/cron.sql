-- 予約配信を1分ごとに実行する設定（Supabase の SQL Editor で1回だけ実行）
-- 事前に Database > Extensions で「pg_cron」を有効にしてください。
select cron.schedule('publish-due-announcements', '* * * * *', $$ select public.publish_due_announcements(); $$);

-- 回答期限を過ぎた出欠・アンケートを締め切る（5分ごと）
select cron.schedule('close-due-surveys', '*/5 * * * *', $$ select public.close_due_surveys(); $$);
