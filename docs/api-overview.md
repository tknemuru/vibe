# DRE インターフェース概要

## CLI インターフェース

DRE は CLI ツールとして動作する。エントリーポイントは `dre` コマンドである。

### コマンド体系

| コマンド | 説明 |
|----------|------|
| `dre job` | ジョブ管理 |
| `dre run-due` | メインパイプライン実行 |
| `dre mail` | 配信管理 |
| `dre doctor` | 設定診断 |
| `dre db` | DB 管理 |
| `dre serve` | Web サーバー起動 |

### dre job — ジョブ管理

| サブコマンド | オプション | 説明 |
|-------------|-----------|------|
| `job ls` | — | 登録済みジョブの一覧表示 |
| `job add` | `-n, --name <name>` (必須) | ジョブを追加する |
| | `-q, --query <query>` | 検索クエリ（単一） |
| | `--queries <queries>` | 検索クエリ（カンマ区切り、複数） |
| | `--mail-limit <limit>` | 配信上限の上書き |
| | `--max-per-run <limit>` | 収集上限の上書き |
| | `--print-type <type>` | Google Books printType（デフォルト: `books`） |
| | `--lang-restrict <lang>` | Google Books langRestrict（デフォルト: `ja`） |
| | `--disabled` | 無効状態で作成 |
| `job update <name>` | `-q, --query <query>` | クエリを更新する |
| | `--queries <queries>` | 複数クエリを更新する |
| | `--mail-limit <limit>` | 配信上限を更新する |
| | `--max-per-run <limit>` | 収集上限を更新する |
| `job rm <name>` | — | ジョブを削除する |
| `job enable <name>` | — | ジョブを有効化する |
| `job disable <name>` | — | ジョブを無効化する |
| `job show <name>` | — | ジョブの詳細を表示する |
| `job cursor reset <job-name>` | `--yes`（必須） | ページングカーソルをリセットする |

### dre run-due — メインパイプライン実行

| オプション | 説明 |
|-----------|------|
| `--dry-run` | due 状態を確認するのみ（実行しない） |
| `--force` | 実行間隔に関わらず全有効ジョブを実行する |
| `--force-mail` | 書籍 0 件でもメールを送信する（テスト用） |

### dre mail — 配信管理

| サブコマンド | オプション | 説明 |
|-------------|-----------|------|
| `mail reset` | `--job <name>` | 特定ジョブの配信状態をリセットする |
| | `--since <duration>` | 指定期間内の書籍をリセット（`7d`, `30d`, `1w` 等） |
| | `--yes` | 確認をスキップする |
| `mail status` | `--job <name>` | 配信統計を表示する（デフォルト: `"combined"`） |

### dre db — DB 管理

| サブコマンド | オプション | 説明 |
|-------------|-----------|------|
| `db reset` | `--yes` | DB をリセットする（バックアップ作成後に再作成） |
| `db info` | — | DB 統計情報を表示する |

### dre doctor — 設定診断

| チェック項目 | 内容 |
|-------------|------|
| ファイル | `.env`, `config/jobs.yaml`, `data/` ディレクトリの存在確認 |
| 環境変数 | 必須・任意の環境変数の設定状態 |
| API クォータ | Google Books API の当日クォータ残量 |

### dre serve — Web サーバー

| オプション | デフォルト | 説明 |
|-----------|-----------|------|
| `--host <host>` | `0.0.0.0` | バインドホスト |
| `--port <port>` | `8787` | ポート番号 |

※ デフォルトの `0.0.0.0` は全ネットワークインターフェースでリッスンする。外部公開を意図しない場合は `127.0.0.1` の使用を推奨する。

## Web サーバーエンドポイント

Hono ベースの Web サーバー。デフォルトポート: `8787`。

### GET /

ヘルスチェック。

**レスポンス:**

```json
{
  "status": "ok",
  "name": "DRE Copy Server",
  "version": "3.0.0"
}
```

### GET /p/:token

プロンプト Copy ページ。メールに含まれるリンクから DeepResearch プロンプトをクリップボードにコピーできる HTML ページを返す。

**パラメータ:**
- `token`: 32文字のトークン

**レスポンス:**
- 200: HTML — Copy ボタン付きのプロンプト表示ページ
- 404: HTML — トークンの長さが不正な場合
- 410: HTML — トークンが存在しないか有効期限切れの場合（Gone）

### 404 ハンドラ

定義されていないパスへのアクセス。

**レスポンス:**

```json
{
  "error": "Not Found",
  "message": "The requested resource was not found"
}
```

### 500 エラーハンドラ

サーバー内部エラー。

**レスポンス:**

```json
{
  "error": "Internal Server Error",
  "message": "<内部エラーメッセージ>"
}
```

※ `message` には `err.message` の内容がそのまま含まれる。内部実装の詳細（DB パス、ライブラリ内部のエラーメッセージ等）が含まれる可能性がある。

## 外部サービス連携

### Google Books API

| 項目 | 内容 |
|------|------|
| エンドポイント | `https://www.googleapis.com/books/v1/volumes` |
| 認証方式 | API キー（`GOOGLE_BOOKS_API_KEY`） |
| Google 側レート制限 | 日次 1,000 クエリ（無料枠） |
| アプリ内制限 | `DAILY_BOOKS_API_LIMIT`（デフォルト: 100） |
| 1 リクエスト最大取得数 | 40 件 |
| 検索オプション | `printType`, `langRestrict`（ジョブごとに必須設定） |

### SMTP (Gmail)

| 項目 | 内容 |
|------|------|
| 用途 | DeepResearch プロンプト付きダイジェストメールの送信 |
| 認証方式 | Gmail アプリパスワード |
| 設定項目 | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_TO` |

## 設定インターフェース

### 環境変数 (.env)

| 変数名 | 必須 | デフォルト | 説明 |
|--------|------|-----------|------|
| GOOGLE_BOOKS_API_KEY | Yes | — | Google Books API キー |
| SMTP_HOST | No | smtp.gmail.com | SMTP サーバーホスト |
| SMTP_PORT | No | 587 | SMTP ポート |
| SMTP_USER | Yes | — | SMTP ユーザー |
| SMTP_PASS | Yes | — | SMTP パスワード（Gmail アプリパスワード） |
| MAIL_TO | Yes | — | 配信先メールアドレス |
| APP_TZ | No | Asia/Tokyo | タイムゾーン |
| DAILY_BOOKS_API_LIMIT | No | 100 | 日次 API クエリ上限 |
| COPY_PAGE_BASE_URL | No | http://localhost:8787 | Copy ページのベース URL |

※ 環境変数セクションには変数名・説明・デフォルト値のみ記載し、実際の値は含めない。

### ジョブ設定 (config/jobs.yaml)

```yaml
defaults:
  interval: 3h            # 実行間隔
  mail_limit: 5           # 1 回の配信上限
  max_per_run: 20         # 1 回の収集上限
  fallback_limit: 3       # フォールバック配信上限

jobs:
  - name: <job-name>
    queries:
      - "<search-query>"
    enabled: true
    google_books:          # 必須設定
      printType: books     # Google Books printType
      langRestrict: ja     # 言語制限
    # ジョブ固有の設定で defaults を上書き可能
    mail_limit: 3
    max_per_run: 10
```

| 項目 | デフォルト | 説明 |
|------|-----------|------|
| `defaults.interval` | `3h` | ジョブの実行間隔 |
| `defaults.mail_limit` | `5` | 1 回の実行で配信する書籍数の上限 |
| `defaults.max_per_run` | `20` | 1 回の実行で収集する書籍数の上限 |
| `defaults.fallback_limit` | `3` | 未配信書籍がない場合のフォールバック配信数 |
| `jobs[].name` | — | ジョブ名（一意） |
| `jobs[].queries` | — | 検索クエリの配列 |
| `jobs[].enabled` | `true` | ジョブの有効/無効 |
| `jobs[].google_books.printType` | — | Google Books printType（必須） |
| `jobs[].google_books.langRestrict` | — | Google Books langRestrict（必須） |
| `jobs[].mail_limit` | defaults 値 | ジョブ固有の配信上限 |
| `jobs[].max_per_run` | defaults 値 | ジョブ固有の収集上限 |

## エラーハンドリング規約

### Google Books API

| エラー | 対処 |
|--------|------|
| ネットワークエラー | エラーログ出力、該当クエリスキップ、他クエリは継続 |
| 認証エラー (401/403) | エラーログ出力、処理中断 |
| レート制限 (429) | 警告ログ出力、Collect スキップ |
| クォータ超過 | 警告ログ出力、翌日 JST リセットまで Collect スキップ |

### SMTP

| エラー | 対処 |
|--------|------|
| 接続エラー | エラーログ出力、配信記録は更新しない（次回再選択） |
| 認証エラー | エラーログ出力、処理中断 |
| 送信エラー | エラーログ出力、配信記録は更新しない（次回再選択） |

### Web サーバー

| エラー | レスポンス |
|--------|-----------|
| 不正トークン（長さ不正） | 404 Not Found (HTML) |
| 存在しない・期限切れトークン | 410 Gone (HTML) |
| サーバー内部エラー | 500 Internal Server Error (JSON) |
| 未定義パス | 404 Not Found (JSON) |
