# DRE 運用ガイド

## セットアップ

### 必要なもの

- Node.js 18 以上
- Google Books API キー
- Gmail アカウント（アプリパスワード）

### インストール

```bash
# リポジトリのクローン
git clone <repository-url>
cd dre

# 依存パッケージのインストール
npm install

# ビルド
npm run build

# グローバルリンク（オプション）
npm link
```

### Google Books API の設定

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 新しいプロジェクトを作成（または既存のプロジェクトを選択）
3. 「API とサービス」→「ライブラリ」→「Books API」を検索して有効化
4. 「API とサービス」→「認証情報」→「認証情報を作成」→「API キー」
5. 作成された API キーをコピー

### Gmail アプリパスワードの設定

1. [Google アカウント設定](https://myaccount.google.com/) にアクセス
2. 「セキュリティ」→「2 段階認証プロセス」を有効化
3. 「アプリパスワード」を選択
4. アプリ:「メール」、デバイス:「その他」で「DRE」と入力
5. 生成された 16 文字のパスワードをコピー

### 環境変数の設定

`.env.example` をコピーして `.env` を作成:

```bash
cp .env.example .env
```

`.env` を編集:

```env
# Google Books API
GOOGLE_BOOKS_API_KEY=your_google_books_api_key_here

# Gmail SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_16_char_app_password
MAIL_TO=recipient@example.com

# App Settings
APP_TZ=Asia/Tokyo
DAILY_BOOKS_API_LIMIT=100
```

### 設定の確認

```bash
dre doctor
```

すべて OK になることを確認してください。

## ジョブ管理

### ジョブの確認

```bash
dre job ls
```

### ジョブの追加

```bash
# 単一クエリのジョブ
dre job add -n ai-books -q "AI プログラミング"

# 複数クエリのジョブ
dre job add -n tech-books -q "Claude AI" -q "プログラミング 入門"
```

### config/jobs.yaml の直接編集

```yaml
defaults:
  interval: 3h
  mail_limit: 5
  max_per_run: 20
  fallback_limit: 3

jobs:
  - name: ai-books
    queries:
      - "AI プログラミング"
      - "機械学習 入門"
    enabled: true

  - name: tech-books
    queries:
      - "TypeScript"
      - "React"
    enabled: true
    mail_limit: 3
    max_per_run: 10
```

### ジョブの一時停止

```bash
# ジョブを無効化
dre job disable ai-books

# 確認
dre job ls
```

### ジョブの再開

```bash
dre job enable ai-books
```

### クエリの更新

```bash
# 既存クエリを置き換え
dre job update ai-books -q "新しいクエリ1" -q "新しいクエリ2"

# または config/jobs.yaml を直接編集
```

## 日常運用

### 定期実行

DRE は 3 時間ごとにジョブを実行するよう設計されています。

```bash
# cron 設定例（毎時実行、内部で 3 時間判定）
0 * * * * cd /path/to/dre && /usr/bin/node dist/cli.js run-due >> /var/log/dre.log 2>&1
```

### 手動実行

```bash
# dry-run（実際には実行しない）
dre run-due --dry-run

# 実行（メール送信含む）
dre run-due

# 強制実行（due 判定をスキップ）
dre run-due --force
```

### ステータス確認

```bash
# 配信ステータス
dre mail status

# DB 情報
dre db info

# 設定診断
dre doctor
```

## 配信リセット

### ユースケース

- 同じ書籍を再度配信したい
- テスト後にステータスをクリアしたい
- 特定ジョブの書籍のみ再配信したい

### コマンド

```bash
# すべての書籍を未配信にリセット
dre mail reset --yes

# 過去 7 日間に配信した書籍のみリセット
dre mail reset --since 7d --yes

# 過去 30 日間
dre mail reset --since 30d --yes

# 過去 1 週間
dre mail reset --since 1w --yes

# 特定ジョブで配信した書籍のみ
dre mail reset --job ai-books --yes
```

### 確認

```bash
# リセット前後のステータス確認
dre mail status
```

## データベース管理

### バックアップ

DB リセット時は自動的にバックアップが作成されます。

```bash
# 手動バックアップ
cp data/app.db data/app.db.manual.$(date +%Y%m%d)
```

### リセット

```bash
# 確認プロンプト付き
dre db reset

# 確認スキップ
dre db reset --yes
```

リセット後、バックアップファイルが `data/app.db.bak.<timestamp>` として保存されます。

### 復元

```bash
# バックアップ一覧
ls -la data/app.db.bak.*

# 復元
cp data/app.db.bak.2024-01-15T10-30-00 data/app.db
```

## トラブルシューティング

### ログの確認

```bash
# 直接実行でログ確認
dre run-due 2>&1 | tee dre-debug.log
```

### よくある問題

#### 「GOOGLE_BOOKS_API_KEY must be set」が表示される

`.env` ファイルに `GOOGLE_BOOKS_API_KEY` が設定されていることを確認してください。

#### 「Quota limit reached」が表示される

日次クエリ上限に達しています。翌日（JST）に自動リセットされます。
`DAILY_BOOKS_API_LIMIT` で上限を調整できます（デフォルト: 100）。

#### 書籍が収集されない

1. クエリが適切か確認
2. Google Books API キーが有効か確認
3. クォータ状況を確認: `dre doctor`

#### メールが送信されない / 届かない

1. `SMTP_PASS` がアプリパスワードであることを確認
2. `MAIL_TO` が正しいメールアドレスであることを確認
3. `dre doctor` で設定を確認
4. 未配信書籍があるか確認: `dre mail status`
5. 強制送信でテスト: `dre run-due --force`

#### 同じ書籍が何度も配信される

DB が正しく更新されていない可能性があります。

```bash
# DB の状態確認
dre db info

# 必要に応じて DB リセット
dre db reset --yes
```

#### 収集される書籍が少ない

1. `max_per_run` の値を増やす
2. クエリを具体的にする（例:「AI」→「AI プログラミング 入門」）

## 監視

### 正常動作の確認

1. `dre mail status` で定期的に配信数を確認
2. メール受信を確認
3. ログでエラーがないか確認

### アラート設定（例）

```bash
#!/bin/bash
# check-dre.sh
UNDELIVERED=$(dre mail status 2>/dev/null | grep "Undelivered:" | awk '{print $2}')
if [ "$UNDELIVERED" = "0" ]; then
  echo "Warning: No undelivered books"
fi
```

## systemd サービス

### 概要

- **使用するサービス名**: `dre-serve.service` のみ
- **重要**: `vibe-serve.service` は作成・維持しない（旧名称は非対応）

### 新規作成手順

1. サービスファイルの作成

```bash
sudo cp /path/to/dre/systemd/dre-serve.service /etc/systemd/system/
```

2. ExecStart のパスを環境に合わせて修正

```bash
sudo vim /etc/systemd/system/dre-serve.service
# ExecStart=/path/to/node /path/to/dre/dist/cli.js serve
```

3. サービスの有効化と開始

```bash
sudo systemctl daemon-reload
sudo systemctl enable dre-serve.service
sudo systemctl start dre-serve.service
```

4. 状態確認

```bash
sudo systemctl status dre-serve.service
```

### 旧サービスからの移行手順

`vibe-serve.service` から移行する場合:

1. 旧サービスの停止・無効化

```bash
sudo systemctl stop vibe-serve.service
sudo systemctl disable vibe-serve.service
sudo rm /etc/systemd/system/vibe-serve.service
sudo systemctl daemon-reload
```

2. 新サービスの設定（上記「新規作成手順」の 1〜4 を実行）

### サービス管理

```bash
# 再起動
sudo systemctl restart dre-serve.service

# ログ確認
sudo journalctl -u dre-serve.service -f

# 停止
sudo systemctl stop dre-serve.service
```

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| `dre doctor` | 設定診断 |
| `dre job ls` | ジョブ一覧 |
| `dre job add -n NAME -q QUERY` | ジョブ追加 |
| `dre job show NAME` | ジョブ詳細 |
| `dre job enable NAME` | ジョブ有効化 |
| `dre job disable NAME` | ジョブ無効化 |
| `dre job rm NAME` | ジョブ削除 |
| `dre run-due` | due ジョブを実行 |
| `dre run-due --dry-run` | 実行せずに確認 |
| `dre run-due --force` | 強制実行 |
| `dre db info` | DB 情報表示 |
| `dre db reset` | DB リセット |
| `dre mail status` | 配信ステータス |
| `dre mail reset` | 配信リセット |
| `dre job cursor reset NAME --yes` | カーソルリセット |

## カーソル管理（ページング状態）

### 概要

Google Books API からの書籍収集は、ページング（startIndex）を使用して段階的に取得します。
カーソル（ページング状態）は `collect_cursor` テーブルに永続化され、次回実行時に続きから取得できます。

### カーソルの動作

1. **初回実行**: `startIndex=0` から開始
2. **継続実行**: 前回の `startIndex` から継続
3. **枯渇検出**: 全件取得完了時に `is_exhausted=true` となり、以降の収集をスキップ

### query_set_hash

クエリ配列が変更されたかを検出するため、SHA-256 ハッシュを使用します。

- クエリ配列をソート後に連結してハッシュ化
- クエリ変更時は新しいハッシュとして扱われ、`startIndex=0` から再開
- 大文字小文字は区別される（API クエリとして重要なため）

### カーソルリセット

クエリは変更していないが、最初から収集し直したい場合:

```bash
# 安全のため --yes が必須
dre job cursor reset ai-books --yes
```

リセットにより:
- 指定ジョブの全カーソルが削除される
- `is_exhausted` フラグがクリアされる
- 次回実行時に `startIndex=0` から開始

### ユースケース

#### 枯渇後に新刊が追加された場合

```bash
# カーソルをリセットして再収集
dre job cursor reset ai-books --yes

# 次回 run-due で startIndex=0 から再開
dre run-due
```

#### 特定ジョブのみ最初から収集し直したい場合

```bash
dre job cursor reset tech-books --yes
```

### トラブルシューティング

#### 「Skipped: exhausted」が表示される

```
[WARN] [ai-books] Skipped: exhausted (query_set_hash=abc123...)
```

全件取得済みのため収集がスキップされています。新刊を取得したい場合は:

```bash
dre job cursor reset ai-books --yes
```

#### クエリを変更したのに古いカーソルが使われる

クエリ変更時は自動的に新しい query_set_hash となります。
古いカーソルは残りますが、新しいクエリでは使用されません。

不要なカーソルをクリアしたい場合:

```bash
dre job cursor reset JOB_NAME --yes
```
