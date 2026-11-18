# 訓練生ポータル（職業訓練生向け 情報共有・コミュニケーションアプリ）

職業訓練生と事務局・講師が、お知らせ・チャット・出欠・アンケートを1つのアプリでやり取りするためのWebアプリです。
全体の設計は [`docs/設計案.md`](docs/設計案.md) を参照してください。

## できること（バージョン 0.7.0）

| 利用者 | 機能 |
|---|---|
| 訓練生 | 招待URL／QRからの登録、ホーム（重要なお知らせ・回答が必要なもの・新着）、お知らせ（画像・PDF添付、既読）、**事務局チャット**（LINE風・写真やファイル送信・既読表示）、**出欠・アンケート回答**（期限内は修正可）、**プッシュ通知**、マイページ |
| 管理者・スタッフ | お知らせ配信（添付・予約・再通知・緊急の時間外通知）、訓練生管理（**Excel/CSV一括登録**・招待QRのまとめて印刷・履歴）、コース・クラス、**チャット受信箱**（対応状態・スタッフ用メモ）、**出欠・アンケート**（集計グラフ・未回答者・CSV出力）、**スタッフ管理**（権限・担当範囲）、祝日・休校日、**操作ログ**、2段階認証 |

通知のルール：訓練生には 平日20時〜翌7時・土日・祝日・休校日 は通知せず、次の平日の朝7時にまとめて1通送ります（アプリ内にはすぐ届きます）。

## 安全のしくみ

- 「誰がどのデータを見てよいか」は、画面ではなく**データベース自体のルール（RLS）**で決めています（[`supabase/migrations/`](supabase/migrations/)）。
- そのルールが正しく働くかを自動テストで確認しています（[`tests/db/rls.test.mjs`](tests/db/rls.test.mjs)）。主な確認内容は次のとおりです。
  - 他の訓練生や他校の情報が見えないこと
  - 担当外のクラスが見えないこと
  - 権限がなければ連絡先が見えないこと
  - スタッフが自分を管理者にできないこと
  - 利用停止中の人には何も見えないこと
- 招待URLは推測できない文字列で、1回限り・7日間有効です。データベースにはハッシュ値しか保存しないので、漏れても使えません。

---

## 使い始めるための準備（初回のみ）

必要なものは **Supabase** と **Vercel** のアカウントだけです（GitHubアカウントでどちらも登録できます）。

### 1. Supabase（データベース）を用意する

1. https://supabase.com で「New project」を作ります。
   - **Region：Northeast Asia (Tokyo)** を選びます（データを日本に置くため）。
   - Database Password は長いものを決めて、安全な場所に保管します。
2. 左メニュー **SQL Editor** を開き、[`supabase/migrations/20261118000001_core.sql`](supabase/migrations/20261118000001_core.sql) の中身を全部貼り付けて「Run」を押します。
3. 予約配信を動かす設定をします。
   1. **Integrations › Cron**（または Database › Extensions で `pg_cron`）を有効にします。
   2. [`supabase/setup/cron.sql`](supabase/setup/cron.sql) を SQL Editor で実行します。
4. **Authentication › Sign In / Providers** で、**「Allow new users to sign up」をオフ**にします。招待制にするため、必ずオフにしてください。
5. 最初の管理者を作ります。
   1. **Authentication › Users › Add user** で、メールアドレスとパスワードを作ります。「Auto Confirm User」にチェックを入れます。
   2. [`supabase/setup/first-admin.sql`](supabase/setup/first-admin.sql) の ★ の3か所を書き換えて、SQL Editor で実行します。
6. **Project Settings › API**（または API Keys）で、次の3つを控えます。
   - Project URL
   - anon（publishable）キー
   - service_role（secret）キー：**絶対に人に見せない**

### 2. Vercel（アプリの公開）に載せる

1. https://vercel.com で「Add New › Project」を選び、このGitHubリポジトリを選びます。
2. **Environment Variables** に次を入れて「Deploy」します。

   | 名前 | 値 |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | SupabaseのProject URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon（publishable）キー |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role（secret）キー |
   | `NEXT_PUBLIC_SITE_URL` | 公開されるURL（例：`https://xxxx.vercel.app`） |
   | `NEXT_PUBLIC_APP_NAME` | アプリ名（例：`○○訓練校ポータル`） |

3. 公開URLが決まったら、Supabaseの **Authentication › URL Configuration** を設定します。
   - **Site URL**：公開URL
   - **Redirect URLs**：`公開URL/auth/callback`

### 3. 段階2〜6の追加設定（バージョン 0.2.0 以降）

1. Supabase の **SQL Editor** で、次の5つのファイルを**この順番で1つずつ**貼り付けて Run します（それぞれ「Success」と出ればOK）。
   1. `supabase/migrations/20261119000002_attachments_import.sql`
   2. `supabase/migrations/20261119000003_chat.sql`
   3. `supabase/migrations/20261119000004_surveys.sql`
   4. `supabase/migrations/20261119000005_notifications.sql`
   5. `supabase/migrations/20261119000006_staff_audit.sql`
2. Supabase の **Database › Extensions** で `pg_cron` と `pg_net` を有効にします。
3. Vercel の **Environment Variables** に次を追加します（値は開発者から受け取ったもの）：
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT`、`CRON_SECRET`、`NEXT_PUBLIC_SITE_URL`
4. [`supabase/setup/cron.sql`](supabase/setup/cron.sql) の ★（URLとCRON_SECRET）を書き換えて SQL Editor で実行します。
5. Vercel で **Redeploy** します。
6. 管理画面の **通知と設定** で「内閣府の祝日データを取り込む」を押します。年末年始などの休校日もここで追加します。
7. （任意）スタッフ・管理者の2段階認証を必須にする場合は、Vercel に `REQUIRE_STAFF_MFA=true` を追加して Redeploy します。先に自分で一度 `/mfa` を開いて登録を済ませてから設定すると安全です。

### 4. 使ってみる

1. 公開URLを開き、管理者でログインします。
2. **コース・クラス**でコースとクラスを登録します。
3. **訓練生**で訓練生を登録し、詳細画面で「招待URLを発行」を押します。URLを送るか、QRコードを印刷して渡します。
4. **お知らせ**を作って配信し、既読状況を確認します。

> 💡 スタッフ（講師）は管理画面の **スタッフ** から追加し、招待URLを渡します。

---

## 開発者向け

```bash
cp .env.example .env.local   # 値を入れる
npm install
npm run dev                  # http://localhost:3000
```

| コマンド | 内容 |
|---|---|
| `npm run typecheck` | 型チェック |
| `npm test` | 単体テスト（日時の処理など） |
| `npm run test:db` | 権限（RLS）テスト。ローカルの PostgreSQL 16 を一時的に起動して実行 |
| `npm run build` | 本番ビルド |

### フォルダ構成

```
src/app/(trainee)/   訓練生の画面（ホーム・お知らせ・チャット・回答・マイページ）
src/app/admin/       管理画面（お知らせ・チャット・出欠/アンケート・訓練生・コース・スタッフ・設定・操作ログ）
src/app/api/cron/    定期実行（通知の送信、祝日の更新）
public/sw.js         通知を受け取る仕組み（Service Worker）
src/app/login, invite, terms, password, forgot-password  ログイン関連
src/lib/             共通処理（認証・Supabase接続・日時表示など）
src/proxy.ts         全画面共通：未ログインならログイン画面へ
supabase/migrations/ データベースの表と権限ルール
supabase/setup/      初回設定用のSQL
tests/               自動テスト
docs/設計案.md       全体設計
```

技術構成：Next.js 16 / React 19 / TypeScript / Tailwind CSS 4 / Supabase（PostgreSQL・認証・Storage・Realtime・pg_cron）/ Web Push / Vercel（東京リージョン）
