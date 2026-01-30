# DRE ドメインモデル

## ドメイン概念

| 概念 | 説明 |
|------|------|
| 書籍 (Book) | ISBN-13 を一意キーとする書籍情報。Google Books API から収集される |
| ジョブ (Job) | 検索クエリ群を管理する収集・配信の単位。`config/jobs.yaml` で定義される |
| 配信 (Delivery) | ジョブ単位のメール配信記録。監査ログとして機能する |
| 配信アイテム (DeliveryItem) | 個別書籍の配信記録。配信状態の SSOT（Single Source of Truth） |
| クォータ (Quota) | 日次 API 利用量。プロバイダー + 日付単位で管理される |
| カーソル (Cursor) | Google Books API のページング状態管理 |
| プロンプト (Prompt) | DeepResearch 用プロンプトテキスト。書籍ごとに生成される |
| プロンプトトークン (PromptToken) | プロンプトへの有効期限付きアクセストークン（32文字 hex） |

## 概念間の関係

```
                    ┌──────────┐
                    │   Job    │
                    │(jobs.yaml)│
                    └────┬─────┘
                         │ has many
                    ┌────v─────┐
                    │  Query   │
                    └────┬─────┘
                         │ collects
                    ┌────v─────┐
           ┌────────┤   Book   ├────────┐
           │        │ (isbn13) │        │
           │        └────┬─────┘        │
           │             │              │
      has many      has many       has many
           │             │              │
    ┌──────v───┐  ┌──────v──────┐  ┌───v──────────┐
    │ Delivery │  │   Prompt    │  │DeliveryItem  │
    │(監査ログ) │  │             │  │  (SSOT)      │
    └──────────┘  └──────┬──────┘  └──────────────┘
                         │
                    has many
                         │
                  ┌──────v──────┐
                  │PromptToken  │
                  │(32char hex) │
                  └─────────────┘
```

```
Job → JobState（実行状態: last_run_at, last_success_at）
Job + QuerySetHash → CollectCursor（ページング状態）
Date + Provider → ApiUsage（クォータカウンタ）
```

## 業務ルール・制約

### ISBN-13 一意性制約

- 同一 ISBN-13 の書籍は DB に 1 レコードのみ存在する
- ISBN のない書籍は収集対象外となる

### 未配信優先選択ルール

- Select フェーズでは `delivery_items` テーブルに未登録の書籍を優先的に選択する
- ジョブ単位で配信状態を管理する（`UNIQUE(job_name, isbn13)`）
- 未配信書籍がない場合は、過去配信済み書籍からフォールバック選択する

### 日次クォータ管理

- Google Books API の呼び出し回数を日次で管理する
- 日付は `APP_TZ`（デフォルト: `Asia/Tokyo`）に基づく JST でリセットされる
- アプリ内上限: `DAILY_BOOKS_API_LIMIT`（デフォルト: 100）

### ページングカーソルと枯渇検出

- Google Books API のページング状態をクエリセット単位で管理する
- クエリセットのハッシュ（SHA-256）をキーとし、クエリ変更時にカーソルをリセットする
- API が結果を返さなくなった場合に枯渇（`is_exhausted`）をマークする

### プロンプトトークンの有効期限管理

- トークンは 32 文字の hex 文字列で発行される
- 有効期限はデフォルト 30 日間
- 期限切れトークンへのアクセスは 410 Gone を返す

## 状態遷移

### 書籍の配信状態

```
未配信                              配信済み
(delivery_items に未登録)  ──→  (delivery_items に登録済み)
(last_delivered_at IS NULL)    (last_delivered_at にタイムスタンプ設定)
```

- `delivery_items` への登録が配信状態の SSOT
- `books.last_delivered_at` は後方互換性のため併せて更新される

### クォータカウンタ

```
0 ──→ count 増加 ──→ DAILY_BOOKS_API_LIMIT（上限到達でスキップ）
│                         │
└──── 日次リセット（JST） ←──┘
```

### カーソル状態

```
初回                 継続                    枯渇
(start_index=0) ──→ (start_index 増加) ──→ (is_exhausted=1)
                                              │
                    ← カーソルリセット（手動） ──┘
```

### プロンプトトークン

```
発行                    有効                    期限切れ
(created_at) ──→ (期間内アクセス可能) ──→ (expires_at 超過: 410 Gone)
```

## データ永続化

### books テーブル（Ver2.0）

書籍情報の中核テーブル。ISBN-13 を一意キーとする。

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| isbn13 | TEXT | PRIMARY KEY | ISBN-13（一意キー） |
| title | TEXT | NOT NULL | 書籍タイトル |
| authors_json | TEXT | — | 著者の JSON 配列 |
| publisher | TEXT | — | 出版社 |
| published_date | TEXT | — | 出版日 |
| description | TEXT | — | 説明文 |
| cover_url | TEXT | — | カバー画像 URL |
| links_json | TEXT | — | 参照リンクの JSON 配列 (`[{label, url}]`) |
| source | TEXT | NOT NULL | データソース（`"google_books"`） |
| first_seen_at | TEXT | NOT NULL | 初回取得日時（ISO タイムスタンプ） |
| last_seen_at | TEXT | NOT NULL | 最終取得日時（ISO タイムスタンプ） |
| last_delivered_at | TEXT | — | 最終配信日時（ISO タイムスタンプ、NULL=未配信） |

**インデックス:**
- `idx_books_undelivered`: `last_delivered_at` WHERE `last_delivered_at IS NULL`
- `idx_books_last_seen`: `last_seen_at`

### deliveries テーブル（Ver4.0 — 監査ログ）

配信イベントの監査ログ。ジョブ単位で配信した書籍群を記録する。

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | 配信 ID |
| job_name | TEXT | NOT NULL | ジョブ名 |
| delivered_at | TEXT | NOT NULL | 配信日時（ISO タイムスタンプ） |
| isbn13_list_json | TEXT | NOT NULL | 配信した ISBN-13 の JSON 配列 |

**インデックス:**
- `idx_deliveries_job`: `job_name`

### delivery_items テーブル（Ver4.0 — SSOT）

個別書籍の配信記録。配信状態の正（Single Source of Truth）。

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | ID |
| delivery_id | INTEGER | NOT NULL, FK→deliveries.id | 配信 ID |
| job_name | TEXT | NOT NULL | ジョブ名 |
| isbn13 | TEXT | NOT NULL | ISBN-13 |
| delivered_at | TEXT | NOT NULL | 配信日時（ISO タイムスタンプ） |

**制約:**
- `UNIQUE(job_name, isbn13)` — 同一ジョブで同一書籍は 1 回のみ配信

**インデックス:**
- `idx_delivery_items_job`: `job_name`
- `idx_delivery_items_isbn13`: `isbn13`
- `idx_delivery_items_delivery`: `delivery_id`

### job_state テーブル

ジョブの実行状態を管理する。

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| job_name | TEXT | PRIMARY KEY | ジョブ名 |
| last_success_at | TEXT | — | 最終成功実行日時 |
| last_run_at | TEXT | — | 最終実行日時 |

### api_usage テーブル

API 利用量を日次で管理する。

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| date | TEXT | PRIMARY KEY (複合) | 日付（YYYY-MM-DD） |
| provider | TEXT | PRIMARY KEY (複合) | プロバイダー名（`"google_books"`） |
| count | INTEGER | NOT NULL DEFAULT 0 | 当日のクエリ数 |

### prompts テーブル（Ver3.0）

DeepResearch 用プロンプトテキストを保持する。

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | プロンプト ID |
| isbn13 | TEXT | NOT NULL | 対象書籍の ISBN-13 |
| prompt_text | TEXT | NOT NULL | DeepResearch プロンプト |
| created_at | TEXT | NOT NULL | 作成日時（ISO タイムスタンプ） |

**インデックス:**
- `idx_prompts_isbn13`: `isbn13`

### prompt_tokens テーブル（Ver3.0）

プロンプトへのアクセストークンを管理する。

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| token | TEXT | PRIMARY KEY | 32文字 hex トークン |
| prompt_id | INTEGER | NOT NULL, FK→prompts.id | プロンプト ID |
| expires_at | TEXT | NOT NULL | 有効期限（ISO タイムスタンプ） |
| created_at | TEXT | NOT NULL | 発行日時（ISO タイムスタンプ） |

**インデックス:**
- `idx_prompt_tokens_expires`: `expires_at`

### collect_cursor テーブル

Google Books API のページング状態を管理する。

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| job_name | TEXT | NOT NULL, PRIMARY KEY (複合) | ジョブ名 |
| query_set_hash | TEXT | NOT NULL, PRIMARY KEY (複合) | クエリセットの SHA-256 ハッシュ |
| start_index | INTEGER | NOT NULL DEFAULT 0 | 次回取得開始位置 |
| is_exhausted | INTEGER | NOT NULL DEFAULT 0 | 枯渇フラグ（0/1） |
| last_updated_at | TEXT | NOT NULL DEFAULT datetime('now') | 最終更新日時（ISO タイムスタンプ） |

**インデックス:**
- `idx_collect_cursor_job`: `job_name`
