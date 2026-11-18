# 訓練生ポータル（職業訓練生向け 情報共有・コミュニケーションアプリ）

職業訓練生と事務局・講師が、お知らせ・チャット・出欠・アンケートを1つのアプリでやり取りするためのWebアプリです。
全体の設計は [`docs/設計案.md`](docs/設計案.md) を参照してください。

## いまできること（段階0〜1：基本機能）

| 利用者 | 機能 |
|---|---|
| 訓練生 | 招待URL／QRからの登録、ログイン、規約同意、ホーム（重要なお知らせ・新着）、お知らせ一覧（カテゴリー絞り込み・未読マーク）・詳細（開くと既読）、マイページ、パスワード変更・再設定 |
| 管理者・スタッフ | ダッシュボード、訓練生の登録・編集・検索・絞り込み・所属変更（履歴が残る）、招待URL・QRコードの発行、利用停止・再開、コース・クラスの登録・編集・アーカイブ、お知らせの作成（全体／コース／クラス、優先度、カテゴリー、今すぐ・予約・下書き）、既読状況・未読者一覧 |

チャット・出欠／アンケート・通知などは、設計案の段階2以降で追加します（画面には「準備中」と表示されます）。

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

### 3. 使ってみる

1. 公開URLを開き、管理者でログインします。
2. **コース・クラス**でコースとクラスを登録します。
3. **訓練生**で訓練生を登録し、詳細画面で「招待URLを発行」を押します。URLを送るか、QRコードを印刷して渡します。
4. **お知らせ**を作って配信し、既読状況を確認します。

> 💡 スタッフ（講師）のアカウント追加画面は段階6で作ります。それまでは、追加が必要なら相談してください。

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
src/app/admin/       管理画面（ダッシュボード・訓練生・コース・お知らせ）
src/app/login, invite, terms, password, forgot-password  ログイン関連
src/lib/             共通処理（認証・Supabase接続・日時表示など）
src/proxy.ts         全画面共通：未ログインならログイン画面へ
supabase/migrations/ データベースの表と権限ルール
supabase/setup/      初回設定用のSQL
tests/               自動テスト
docs/設計案.md       全体設計
```

技術構成：Next.js 16 / React 19 / TypeScript / Tailwind CSS 4 / Supabase（PostgreSQL・認証）
