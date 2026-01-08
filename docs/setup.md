# Vibe セットアップガイド

## 必要なもの

- Node.js 18以上
- WSL2 (Windows 11)
- Google Custom Search API キー
- Gmail アカウント (アプリパスワード)
- OpenAI API キー

## 1. インストール

```bash
# リポジトリのクローン
git clone <repository-url>
cd vibe

# 依存パッケージのインストール
npm install

# ビルド
npm run build

# グローバルリンク (オプション)
npm link
```

## 2. Google Custom Search API の設定

### 2.1 APIキーの取得

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 新しいプロジェクトを作成（または既存のプロジェクトを選択）
3. 「APIとサービス」→「認証情報」→「認証情報を作成」→「APIキー」
4. 作成されたAPIキーをコピー

**重要**: Billingを紐付けないでください。無料枠（100クエリ/日）のみ使用します。

### 2.2 検索エンジンの作成

1. [Programmable Search Engine](https://programmablesearchengine.google.com/controlpanel/all) にアクセス
2. 「検索エンジンを追加」をクリック
3. 「検索するサイト」に以下を追加:
   - `note.com`
   - `zenn.dev`
   - `qiita.com`
4. 検索エンジン名を入力して作成
5. 「検索エンジンID (cx)」をコピー

## 3. Gmail アプリパスワードの設定

1. [Googleアカウント設定](https://myaccount.google.com/) にアクセス
2. 「セキュリティ」→「2段階認証プロセス」を有効化
3. 「アプリパスワード」を選択
4. アプリ: 「メール」、デバイス: 「その他」で「Vibe」と入力
5. 生成された16文字のパスワードをコピー

## 4. OpenAI API の設定

1. [OpenAI Platform](https://platform.openai.com/api-keys) にアクセス
2. 新しいAPIキーを作成
3. APIキーをコピー

## 5. 環境変数の設定

`.env.example` をコピーして `.env` を作成:

```bash
cp .env.example .env
```

`.env` を編集:

```env
# Google Custom Search API
GCS_API_KEY=your_google_api_key_here
GCS_CX=your_search_engine_id_here

# OpenAI API
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL_PRIMARY=gpt-4o-mini
OPENAI_MODEL_FALLBACK=gpt-4o

# Gmail SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_16_char_app_password
MAIL_TO=recipient@example.com

# App Settings
APP_TZ=Asia/Tokyo
DAILY_QUERY_LIMIT=95
```

## 6. 設定の確認

```bash
# 設定診断
vibe doctor
```

すべてOKになることを確認してください。

## 7. ジョブの確認

```bash
# ジョブ一覧
vibe job ls

# ジョブの詳細
vibe job show claude-vibe-coding
```

## 8. 手動実行

```bash
# dry-run（実際には実行しない）
vibe run-due --dry-run

# 実行
vibe run-due
```

## 9. トラブルシューティング

### 「Quota limit reached」が表示される

日次クエリ上限（95）に達しています。翌日（JST）に自動リセットされます。

### メールが届かない

1. `SMTP_PASS` がアプリパスワードであることを確認
2. `MAIL_TO` が正しいメールアドレスであることを確認
3. Gmailの「安全性の低いアプリのアクセス」設定を確認

### 検索結果が0件

1. `GCS_CX` が正しい検索エンジンIDであることを確認
2. 検索エンジンの設定で対象サイトが正しく設定されていることを確認

## ディレクトリ構成

```
vibe/
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
| `vibe doctor` | 設定診断 |
| `vibe job ls` | ジョブ一覧 |
| `vibe job add -n NAME -q QUERY` | ジョブ追加 |
| `vibe job show NAME` | ジョブ詳細 |
| `vibe job enable NAME` | ジョブ有効化 |
| `vibe job disable NAME` | ジョブ無効化 |
| `vibe job rm NAME` | ジョブ削除 |
| `vibe run-due` | dueジョブを実行 |
| `vibe run-due --dry-run` | 実行せずに確認 |
| `vibe run-due --force` | 強制実行 |
| `vibe feedback inbox` | 未評価アイテム一覧 |
| `vibe feedback good ID...` | Good評価 |
| `vibe feedback bad ID...` | Bad評価 |
| `vibe feedback stats` | フィードバック統計 |
