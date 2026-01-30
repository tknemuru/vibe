# [RFC] システム概要ドキュメントの作成

| 項目 | 内容 |
| :--- | :--- |
| **作成者 (Author)** | AI (Claude) |
| **ステータス** | Accepted (承認済) |
| **作成日** | 2026-01-30 |
| **タグ** | docs, 優先度: 中 |
| **関連リンク** | CLAUDE.md「System Overview Documents」セクション |

## 1. 要約 (Summary)

- CLAUDE.md で定義された「システム概要ドキュメント」規約に基づき、`docs/architecture.md`・`docs/domain-model.md`・`docs/api-overview.md` の 3 ドキュメントを新規作成する。
- 既存の `docs/arch.md`・`docs/spec.md` は参考情報として活用するが、現行コードベースとの乖離があるため、コードベース調査に基づく正確な情報で新ドキュメントを作成する。移行完了後に旧ファイルを削除する。
- `docs/ops.md` はシステム概要ドキュメントとは目的が異なる運用ガイドであるため、そのまま維持する。

## 2. 背景・動機 (Motivation)

- CLAUDE.md にて、リポジトリごとに IEEE 1016 の 3 ビューポイント（Structure / Data / Interface）に対応するシステム概要ドキュメントを `docs/` 配下に配置する規約が定義されている。
- 現状、DRE リポジトリには以下の 3 ドキュメントが存在する。

| 既存ファイル | 内容 |
|---|---|
| `docs/arch.md` | コンポーネント責務、データフロー、ディレクトリ構成、設計判断、失敗モード、べき等性、状態遷移の不変条件 |
| `docs/spec.md` | 目的、ユースケース、外部インターフェース、データモデル、設定項目、不変条件、制約 |
| `docs/ops.md` | セットアップ、ジョブ管理、日常運用、トラブルシューティング、systemd、コマンド一覧 |

- これらは規約で定義されたファイル名・構成と一致しておらず、内容の分割方針も異なる。具体的には以下の不一致がある。
  - `arch.md` は `architecture.md` と類似するが、ドメインモデル要素（状態遷移の不変条件）も含む
  - `spec.md` はドメインモデル（データモデル・不変条件）とインターフェース定義（外部 API・設定項目）が混在している
  - 規約で定義された `domain-model.md` と `api-overview.md` に相当するドキュメントが独立して存在しない
- さらに、既存ドキュメントは現行コードベースとの乖離が複数存在する（詳細はセクション 4 を参照）。
- 規約に準拠したドキュメント体系へ移行することで、各コマンド（`/imp`、`/rimp` 等）がシステム概要ドキュメントを正しく参照できるようになる。

## 3. 目的とスコープ (Goals & Non-Goals)

### 目的 (Goals)

- CLAUDE.md の「System Overview Documents」規約に準拠した 3 ドキュメントを作成する
- コードベース調査に基づき正確な情報で新ドキュメントを作成する。既存ドキュメント（`arch.md`・`spec.md`）は参考情報として扱い、陳腐化した記述はコードベースの実装に基づいて更新する
- 新ドキュメントには、既存ドキュメントに記載されていない最新のスキーマ・エンドポイント・設定項目を網羅する

### やらないこと (Non-Goals)

- `docs/ops.md` の改廃（運用ガイドはシステム概要ドキュメントのスコープ外である）
- コードの変更（本 RFC はドキュメントのみの変更である）
- 他リポジトリへのシステム概要ドキュメント導入

## 4. 前提条件・依存関係 (Prerequisites & Dependencies)

- CLAUDE.md の「System Overview Documents」セクションが確定済みであること
- 既存ドキュメント（`arch.md`・`spec.md`）は現行コードベースと乖離している箇所がある。新ドキュメント作成時はコードベースの実装（`src/db/init.ts`、`src/server/index.ts` 等）を正とする

### 既知の乖離点

| 項目 | 既存ドキュメントの記述 | 現行コードベースの実態 |
|---|---|---|
| books テーブルスキーマ | `isbn13, title, authors, delivered, delivered_at, job_name` | `isbn13, title, authors_json, publisher, published_date, description, cover_url, links_json, source, first_seen_at, last_seen_at, last_delivered_at` |
| 配信判定方式 | `delivered` boolean フラグ | `last_delivered_at IS NULL` によるタイムスタンプ判定 |
| テーブル数 | books のみ記載 | 全 8 テーブル（books, deliveries, delivery_items, job_state, api_usage, prompts, prompt_tokens, collect_cursor） |
| Web エンドポイント | 記載なし | `GET /`（ヘルスチェック）、`GET /p/:token`（Copy ページ） |
| jobs.yaml スキーマ | `google_books` 未記載 | `google_books`（`printType`, `langRestrict`）が必須 |
| 環境変数 | `COPY_PAGE_BASE_URL` 未記載 | `.env.example` に定義済み |

## 5. 詳細設計 (Detailed Design)

### 5.1 既存ドキュメントの内容マッピング

既存ドキュメントの各セクションを新ドキュメントへ以下のように配置する。ただし、陳腐化した記述はコードベースに基づいて更新する。

| 既存ドキュメントのセクション | 移行先 | 備考 |
|---|---|---|
| `arch.md` > コンポーネント責務 | `architecture.md` | |
| `arch.md` > データフローと依存方向 | `architecture.md` | |
| `arch.md` > ディレクトリ構成 | `architecture.md` | プロジェクトルート構造を含むよう拡張 |
| `arch.md` > 重要な設計判断 | `architecture.md` | |
| `arch.md` > 失敗モードと設計上の扱い | `architecture.md` | |
| `arch.md` > 再実行性・Idempotency | `architecture.md` | |
| `arch.md` > 状態遷移の不変条件 | `domain-model.md` | |
| `spec.md` > 目的 | `architecture.md` > システム概要 > スコープ | |
| `spec.md` > 非目的 | `architecture.md` > システム概要 > スコープ | 非目的として明示的に記載 |
| `spec.md` > ユースケース | `architecture.md` > システム概要 | |
| `spec.md` > 外部インターフェース | `api-overview.md` | |
| `spec.md` > 主要フロー | `architecture.md` > データフロー | 統合 |
| `spec.md` > データモデル | `domain-model.md` | コードベースに基づき全面更新 |
| `spec.md` > 設定項目 | `api-overview.md` > 設定インターフェース | `COPY_PAGE_BASE_URL` 等を補完 |
| `spec.md` > 不変条件・制約 | `domain-model.md` | |
| `ops.md`（全体） | 移行しない（そのまま維持） | |

### 5.2 新ドキュメントの構成

#### `docs/architecture.md` — システム構造の把握

```markdown
# DRE アーキテクチャ

## システム概要
- DRE（DeepResearch Email）の目的と全体像
- スコープ（目的と非目的）
  - 目的: 書籍収集と DeepResearch 支援メール配信
  - 非目的: 書籍の全文検索・閲覧、複数ユーザー同時配信、リアルタイム通知

## 技術スタック
- TypeScript 5.9 / Node.js (ES2022 module)
- CLI: Commander 14.x
- DB: SQLite (better-sqlite3 12.x)
- メール: Nodemailer 7.x (SMTP)
- Web: Hono 4.x (@hono/node-server)
- 設定: js-yaml 4.x (YAML), dotenv 17.x (環境変数)
- テスト: Vitest 3.x
- ビルド: tsc, 開発実行: tsx

## ディレクトリ構成
- プロジェクトルート構造（config/, data/, .env, dist/ 等）
- src/ 配下のモジュール構造と責務
  - collectors/ — 書籍データ収集
  - commands/ — CLI コマンド
  - config/ — 設定管理
  - db/ — データアクセス・永続化
  - server/ — Web サーバー
  - services/ — ビジネスロジック
  - utils/ — ユーティリティ

## レイヤー構造と依存関係
- commands → services → db の依存方向
- 外部依存（Google Books API, SMTP）は境界で分離

## コンポーネント構成
- Collect / Upsert / Select / Mail の責務と依存方向
- Web サーバー (Hono) — Copy ページによるプロンプト閲覧機能

## データフロー
- Collect → Upsert → Select → Mail のパイプライン図

## 重要な設計判断
- ISBN-13 重複排除、未配信優先戦略、ジョブ単位管理、単一配信先

## 失敗モードと復旧
- 各外部依存の障害時の挙動と復旧方法

## 再実行性・べき等性
- 各コンポーネントのべき等性特性

## デプロイ構成
- systemd サービス (dre-serve.service)
- cron による定期実行
```

#### `docs/domain-model.md` — ドメイン概念・データの把握

```markdown
# DRE ドメインモデル

## ドメイン概念
- 書籍 (Book) — ISBN-13 を一意キーとする書籍情報
- ジョブ (Job) — 検索クエリ群を管理する収集・配信の単位
- 配信 (Delivery) — ジョブ単位のメール配信記録
- 配信アイテム (DeliveryItem) — 個別書籍の配信記録（SSOT）
- クォータ (Quota) — 日次 API 利用量
- カーソル (Cursor) — ページング状態管理
- プロンプト (Prompt) — DeepResearch 用プロンプトテキスト
- プロンプトトークン (PromptToken) — プロンプトへの有効期限付きアクセストークン

## 概念間の関係
- Job → Query → Book → Delivery の関係図
- Book → Prompt → PromptToken の関係図
- Job → JobState（実行状態）

## 業務ルール・制約
- ISBN-13 一意性制約
- 未配信優先選択ルール（last_delivered_at IS NULL）
- 日次クォータ管理（JST リセット）
- ページングカーソルと枯渇検出
- プロンプトトークンの有効期限管理

## 状態遷移
- 書籍の配信状態: 未配信（last_delivered_at IS NULL）→ 配信済み（last_delivered_at にタイムスタンプ設定）
- クォータカウンタ: 0 → DAILY_BOOKS_API_LIMIT（日次リセット）
- カーソル: 初回（start_index=0）→ 継続（start_index 増加）→ 枯渇（is_exhausted=1）
- プロンプトトークン: 発行（created_at）→ 有効 → 期限切れ（expires_at 超過）

## データ永続化

### books テーブル（Ver2.0）
- isbn13 (PK), title, authors_json, publisher, published_date, description,
  cover_url, links_json, source, first_seen_at, last_seen_at, last_delivered_at

### deliveries テーブル（Ver4.0 — 監査ログ）
- id (PK), job_name, delivered_at, isbn13_list_json

### delivery_items テーブル（Ver4.0 — SSOT）
- id (PK), delivery_id (FK→deliveries), job_name, isbn13, delivered_at
- UNIQUE(job_name, isbn13)

### job_state テーブル
- job_name (PK), last_success_at, last_run_at

### api_usage テーブル
- date + provider (複合PK), count

### prompts テーブル（Ver3.0）
- id (PK), isbn13, prompt_text, created_at

### prompt_tokens テーブル（Ver3.0）
- token (PK), prompt_id (FK→prompts), expires_at, created_at

### collect_cursor テーブル
- job_name + query_set_hash (複合PK), start_index, is_exhausted, last_updated_at
```

#### `docs/api-overview.md` — インターフェース設計の把握

```markdown
# DRE インターフェース概要

## CLI インターフェース
- コマンド体系（job, run-due, mail, doctor, db, serve）
- 各コマンドのサブコマンドとオプション

## Web サーバーエンドポイント
- Hono ベースの Web サーバー（デフォルトポート: 8787）
- GET / — ヘルスチェック（JSON: status, name, version）
- GET /p/:token — プロンプト Copy ページ（HTML）
  - トークン長: 32文字
  - 期限切れトークン: 410 Gone
  - 不正トークン: 404 Not Found
- 404 ハンドラ（JSON エラーレスポンス）
- 500 エラーハンドラ（JSON エラーレスポンス）

## 外部サービス連携

### Google Books API
- 認証方式: API キー（GOOGLE_BOOKS_API_KEY）
- レート制限: 日次 1,000 クエリ（Google 無料枠）
- アプリ内制限: DAILY_BOOKS_API_LIMIT（デフォルト: 100）
- 検索オプション: printType, langRestrict（ジョブごとに必須設定）

### SMTP (Gmail)
- 認証方式: Gmail アプリパスワード
- 設定項目: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_TO

## 設定インターフェース

### 環境変数 (.env)

| 変数名 | 必須 | デフォルト | 説明 |
|--------|------|-----------|------|
| GOOGLE_BOOKS_API_KEY | Yes | - | Google Books API キー |
| SMTP_HOST | Yes | - | SMTP サーバーホスト |
| SMTP_PORT | Yes | - | SMTP ポート |
| SMTP_USER | Yes | - | SMTP ユーザー |
| SMTP_PASS | Yes | - | SMTP パスワード（Gmail アプリパスワード） |
| MAIL_TO | Yes | - | 配信先メールアドレス |
| APP_TZ | No | Asia/Tokyo | タイムゾーン |
| DAILY_BOOKS_API_LIMIT | No | 100 | 日次 API クエリ上限 |
| COPY_PAGE_BASE_URL | No | http://localhost:8787 | Copy ページのベース URL |

※ 環境変数セクションには変数名・説明・デフォルト値のみ記載し、実際の値は含めない。

### ジョブ設定 (config/jobs.yaml)

- defaults: interval, mail_limit, max_per_run, fallback_limit
- jobs[]: name, queries, enabled, google_books (必須: printType, langRestrict)
- ジョブ固有の mail_limit, max_per_run で defaults を上書き可能

## エラーハンドリング規約
- 各外部連携のエラーパターンと対処方針
```

### 5.3 既存ファイルの削除

新ドキュメント作成完了後、以下のファイルを削除する。

- `docs/arch.md`
- `docs/spec.md`

`docs/ops.md` は運用ガイドとして維持する。

### 5.4 旧ドキュメント参照の更新

リポジトリ内のすべてのファイル（`docs/`、ソースコード、設定ファイル等）を対象に、`arch.md` および `spec.md` への参照を検索し、新ドキュメントへの参照に更新する。現時点の調査では、ソースコードやスクリプトに旧ドキュメントへの参照は存在しない。

## 6. 代替案の検討 (Alternatives Considered)

### 案A: 新規作成＋旧ドキュメント削除（採用案）

- **概要**: 規約に準拠した 3 ドキュメントを新規作成し、内容移行後に `arch.md`・`spec.md` を削除する。`ops.md` は維持する。
- **長所**: 規約と完全一致する構成になる。重複ドキュメントが残らず、メンテナンス対象が明確である。コードベースとの乖離を解消した正確なドキュメントを最初から作成できる。
- **短所**: 一度に複数ファイルの作成・削除が発生する。Git の履歴上は新規ファイルとして記録される。

### 案B: 既存ドキュメントのリネーム＋再構成

- **概要**: `arch.md` を `architecture.md` に `git mv` でリネームし、`spec.md` の内容を `domain-model.md` と `api-overview.md` に分割する。
- **長所**: `arch.md` → `architecture.md` の Git 履歴が保持される。
- **短所**: `arch.md` と `architecture.md` の内容範囲は完全一致しない（`arch.md` の状態遷移不変条件は `domain-model.md` に移すべき）。リネーム後に大幅な内容変更が必要であり、実質的に新規作成と変わらない。Git 履歴の保持も、内容が大幅に変わるため意味が薄い。

### 案C: 新規作成＋旧ドキュメント非推奨マーク付き保持

- **概要**: 新規 3 ドキュメントを作成し、旧ドキュメントには「非推奨: architecture.md / domain-model.md を参照」のヘッダーを追加して一定期間保持する。
- **長所**: 移行期間を設けることで参照先の変更を段階的に行える。
- **短所**: 重複ドキュメントが一時的に共存する。個人プロジェクトでは移行期間を設ける実益がない。非推奨マーク付きファイルが残り続けるリスクがある。

### 選定理由

- 案A を採用する。DRE は個人プロジェクトであり、旧ドキュメントへの外部参照は存在しない。Git 履歴も `arch.md` の内容が大幅に再構成されるため保持の意義が薄い。さらに、既存ドキュメントとコードベースの乖離が大きいため、コードベースを正として新規作成する案A が最も合理的である。

## 7. 横断的関心事 (Cross-Cutting Concerns)

### 7.1 セキュリティとプライバシー

- ドキュメントのみの変更であり、コード変更を含まないため、システム上のセキュリティ脆弱性は発生しない。
- `api-overview.md` の環境変数セクションには変数名・説明・デフォルト値のみを記載し、実際の API キーや SMTP パスワード等の機密値を含めないこと。

### 7.2 スケーラビリティとパフォーマンス

- 該当なし

### 7.3 可観測性 (Observability)

- 該当なし

### 7.4 マイグレーションと後方互換性

- `docs/arch.md` および `docs/spec.md` を削除するため、これらを参照しているファイルがあれば更新が必要である。
- リポジトリ内全ファイルを対象に旧ドキュメント参照を検索する。現時点の調査ではソースコード・スクリプト内に参照は存在しない。
- ロールバックは Git revert で対応可能である。

## 8. テスト戦略 (Test Strategy)

- ドキュメントのみの変更であるため、自動テストは不要である。
- 検証項目:
  - 新ドキュメント 3 ファイルが `docs/` 直下に存在すること
  - `docs/arch.md`・`docs/spec.md` が削除されていること
  - `docs/ops.md` が変更なく維持されていること
  - 各ドキュメントの Markdown が正しく描画されること（PR プレビューで確認）
  - 新ドキュメントの DB スキーマ記述が `src/db/init.ts` の `initSchema` と整合していること
  - 新ドキュメントの Web エンドポイント記述が `src/server/index.ts` および `src/server/routes/prompt.ts` と整合していること

## 9. 実装・リリース計画 (Implementation Plan)

以下のフェーズで実施する。

### フェーズ 1: ドキュメント作成

1. コードベースを調査し、現行スキーマ・エンドポイント・設定項目を把握する（特にセクション 4 の既知の乖離点を重点的に確認）
2. `docs/architecture.md` を作成する
3. `docs/domain-model.md` を作成する（全 8 テーブルのスキーマを `src/db/init.ts` に基づき記載）
4. `docs/api-overview.md` を作成する（Web エンドポイントは `src/server/` に基づき記載）

### フェーズ 2: 旧ドキュメント削除と参照更新

5. リポジトリ内全ファイルで `arch.md`・`spec.md` への参照を検索し、必要に応じて更新する
6. `docs/arch.md` を削除する
7. `docs/spec.md` を削除する

### フェーズ 3: 検証

8. 新ドキュメントの DB スキーマ記述が `src/db/init.ts` と整合しているか確認する
9. 新ドキュメントの Web エンドポイント記述が `src/server/` と整合しているか確認する
10. Markdown の描画を PR 上で確認する

### システム概要ドキュメントへの影響

本 RFC 自体がシステム概要ドキュメントの新規作成を目的としているため、`docs/architecture.md`・`docs/domain-model.md`・`docs/api-overview.md` が本 RFC の成果物として作成される。
