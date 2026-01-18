# DRE Ver2.0 セットアップガイド

## 概要

DREは書籍収集 + DeepResearch支援メールシステムです。
Google Books APIで書籍を収集し、DeepResearch用プロンプト付きメールを配信します。

## 必要なもの

- Node.js 18以上
- Google Books API キー
- Gmail アカウント (アプリパスワード)

## 1. インストール

```bash
# リポジトリのクローン
git clone <repository-url>
cd dre

# 依存パッケージのインストール
npm install

# ビルド
npm run build

# グローバルリンク (オプション)
npm link
```

## 2. Google Books API の設定

### 2.1 APIキーの取得

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 新しいプロジェクトを作成（または既存のプロジェクトを選択）
3. 「APIとサービス」→「ライブラリ」→「Books API」を検索して有効化
4. 「APIとサービス」→「認証情報」→「認証情報を作成」→「APIキー」
5. 作成されたAPIキーをコピー

**注意**: Books APIは無料で1日1,000クエリまで使用可能です。

## 3. Gmail アプリパスワードの設定

1. [Googleアカウント設定](https://myaccount.google.com/) にアクセス
2. 「セキュリティ」→「2段階認証プロセス」を有効化
3. 「アプリパスワード」を選択
4. アプリ: 「メール」、デバイス: 「その他」で「DRE」と入力
5. 生成された16文字のパスワードをコピー

## 4. 環境変数の設定

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

## 5. 設定の確認

```bash
# 設定診断
dre doctor
```

すべてOKになることを確認してください。

## 6. ジョブの設定

### 6.1 ジョブの確認

```bash
# ジョブ一覧
dre job ls
```

### 6.2 ジョブの追加

```bash
# 単一クエリのジョブ
dre job add -n ai-books -q "AI プログラミング"

# 複数クエリのジョブ
dre job add -n tech-books -q "Claude AI" -q "プログラミング 入門"
```

### 6.3 config/jobs.yaml の直接編集

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

## 7. 手動実行

```bash
# dry-run（実際には実行しない）
dre run-due --dry-run

# 実行（メール送信含む）
dre run-due

# 強制実行（due判定をスキップ）
dre run-due --force
```

## 8. データ管理

### 8.1 配信ステータスの確認

```bash
dre mail status
```

### 8.2 配信ステータスのリセット

```bash
# すべてリセット
dre mail reset --yes

# 過去7日間のみリセット
dre mail reset --since 7d --yes

# 特定ジョブのみリセット
dre mail reset --job ai-books --yes
```

### 8.3 データベースのリセット

```bash
# バックアップを取ってリセット
dre db reset --yes

# データベース情報の確認
dre db info
```

## ディレクトリ構成

```
dre/
├── config/
│   └── jobs.yaml      # ジョブ設定
├── data/
│   └── app.db         # SQLiteデータベース（自動生成）
├── .env               # 環境変数
├── .env.example       # 環境変数のテンプレート
└── dist/              # ビルド済みファイル
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
| `dre run-due` | dueジョブを実行 |
| `dre run-due --dry-run` | 実行せずに確認 |
| `dre run-due --force` | 強制実行 |
| `dre db info` | DB情報表示 |
| `dre db reset` | DBリセット |
| `dre mail status` | 配信ステータス |
| `dre mail reset` | 配信リセット |

## トラブルシューティング

### 「GOOGLE_BOOKS_API_KEY must be set」が表示される

`.env` ファイルに `GOOGLE_BOOKS_API_KEY` が設定されていることを確認してください。

### 「Quota limit reached」が表示される

日次クエリ上限に達しています。翌日（JST）に自動リセットされます。
`DAILY_BOOKS_API_LIMIT` で上限を調整できます（デフォルト: 100）。

### メールが届かない

1. `SMTP_PASS` がアプリパスワードであることを確認
2. `MAIL_TO` が正しいメールアドレスであることを確認
3. `dre doctor` で設定を確認

### 収集される書籍が少ない

1. `max_per_run` の値を増やす
2. クエリを具体的にする（例: 「AI」→「AI プログラミング 入門」）
