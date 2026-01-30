## Technical Quality Reviewer によるレビュー結果

### 1. 判定 (Decision)

- **Status**: Request Changes

**判定基準:** P0 が1件以上存在するため Request Changes とする。

### 2. 良い点 (Strengths)

- **5.1 既存ドキュメントの内容マッピング**: 既存ドキュメントの各セクションを新ドキュメントへどう配置するかが明確な対応表として整理されている。移行漏れの防止に有効であり、レビュー時の検証も容易である。
- **6. 代替案の検討**: 3案を比較し、個人プロジェクトという文脈に即して案Aを選定した判断は合理的である。特に案Bの Git 履歴保持が内容変更の大きさに対して実質無意味であるという分析は的確である。
- **5.3 既存ファイルの削除**: `ops.md` を維持しつつ旧ドキュメントを削除する判断は、スコープが明確であり過剰な変更を避けている。
- **全体構成**: RFC としてシンプルな構造であり、ドキュメント専用の RFC として適切な複雑度に抑えられている。コード変更を含まないため、テスト戦略も妥当である。

### 3. 指摘事項 (Issues)

#### Severity 定義

| Severity | 定義 |
| :--- | :--- |
| **P0 (Blocker)** | 修正必須。論理的欠陥、仕様漏れ、重大なリスク、回答必須の質問 |
| **P1 (Nit)** | 提案。より良い手法、軽微な懸念、参考情報 |

#### 指摘一覧

**[P0-1] 既存ドキュメントと現行コードベースの乖離が前提条件として未検証**

- **対象セクション**: 4. 前提条件・依存関係 / 5.2 新ドキュメントの構成
- **内容**: 前提条件に「既存ドキュメント（`arch.md`・`spec.md`・`ops.md`）の内容が現行コードベースと整合していること」とあるが、実際にはコードベースと既存ドキュメントに複数の乖離が確認される。具体的には以下の点が挙げられる。
  - `spec.md` の books テーブルカラムは `authors`, `delivered`, `delivered_at`, `job_name` と記載されているが、現行コードの Ver2.0 スキーマでは `authors_json`, `publisher`, `published_date`, `description`, `cover_url`, `links_json`, `source`, `first_seen_at`, `last_seen_at`, `last_delivered_at` であり、大幅に異なる。`delivered` フラグは `last_delivered_at IS NULL` による判定に変更されている。
  - `spec.md` には `deliveries` テーブル、`delivery_items` テーブル、`job_state` テーブル、`api_usage` テーブル、`prompts` テーブル、`prompt_tokens` テーブル、`collect_cursor` テーブルの記載が存在しない。
  - `spec.md` の jobs.yaml スキーマに `google_books`（`printType`, `langRestrict`）が必須項目として存在するが記載されていない。
  - `architecture.md` の構成案に Web サーバー（Hono）が「位置づけ」のみの記載であるが、実際には Copy ページ（`/p/:token`）を提供するプロンプトトークンシステムが存在し、これは独立したアーキテクチャ上の機能である。
  - RFC の 5.2 の `domain-model.md` 構成案では books テーブルのカラムが `isbn13, title, authors, delivered, delivered_at, job_name` と旧スキーマのまま記載されている。
  - この乖離が移行時に引き継がれると、新ドキュメントが作成直後から不正確な状態になる。
- **修正の期待値**: 前提条件の文言を「コードベースの最新状態を調査し、既存ドキュメントとの差分を把握した上で新ドキュメントに反映する」旨に修正するか、目的セクションにある「コードベース調査に基づく最新情報で内容を補完する」を具体化し、補完すべき既知の乖離点を 5.2 の各ドキュメント構成案に反映すること。特に `domain-model.md` の DB スキーマ記述は現行コードの `initSchema` に基づいて全テーブル（books, deliveries, delivery_items, job_state, api_usage, prompts, prompt_tokens, collect_cursor）を網羅すること。

**[P0-2] `api-overview.md` のエンドポイント記述が不正確**

- **対象セクション**: 5.2 新ドキュメントの構成 > `docs/api-overview.md`
- **内容**: RFC の `api-overview.md` 構成案では Web サーバーエンドポイントとして「/prompt 等のエンドポイント一覧」と記載されているが、実際のコードでは `/prompt` というエンドポイントは存在しない。現行のルーティングは以下の通りである。
  - `GET /` — ヘルスチェック（JSON レスポンス）
  - `GET /p/:token` — プロンプト Copy ページ（HTML レスポンス）
  - RFC が設計ドキュメントの移行を目的とする以上、新ドキュメントに記載するインターフェース情報が不正確であってはならない。
- **修正の期待値**: 5.2 の `api-overview.md` 構成案内のエンドポイント記述を、コードベースの `src/server/index.ts` および `src/server/routes/prompt.ts` に基づいて正確に記載すること。`/prompt` を `/p/:token` に修正し、ヘルスチェックエンドポイント `GET /` も明記すること。

**[P1-1] `domain-model.md` にプロンプト・トークンのドメイン概念が未記載**

- **対象セクション**: 5.2 新ドキュメントの構成 > `docs/domain-model.md`
- **内容**: 構成案のドメイン概念に「書籍 (Book)、ジョブ (Job)、配信 (Delivery)、クォータ (Quota)、カーソル (Cursor)」が列挙されているが、Ver3.0 で追加されたプロンプト (Prompt) およびプロンプトトークン (PromptToken) のドメイン概念が欠落している。これらは `prompts` テーブルと `prompt_tokens` テーブルとして永続化されており、Web サーバーの `/p/:token` エンドポイントと連携する独立したドメイン概念である。
- **修正の期待値**: ドメイン概念のリストにプロンプト (Prompt) とプロンプトトークン (PromptToken) を追加し、概念間の関係図にも `Book → Prompt → PromptToken` の関係を含めることを推奨する。状態遷移セクションにもトークンの有効期限（発行 → 有効 → 期限切れ）を記載することが望ましい。

**[P1-2] `architecture.md` の技術スタック記載にバージョン依存の補足が不足**

- **対象セクション**: 5.2 新ドキュメントの構成 > `docs/architecture.md` > 技術スタック
- **内容**: 技術スタックの一覧に「TypeScript 5.x / Node.js (ES2022)」とあるが、`package.json` の実際の設定値（Node.js バージョン要件、TypeScript バージョン等）との整合性は RFC 内で確認されていない。ドキュメント作成時に正確なバージョンを記載することが望ましい。また、`js-yaml`（YAML パーサー）や `dotenv`（環境変数ローダー）など、アーキテクチャ上重要な依存ライブラリの記載漏れがある。
- **修正の期待値**: 技術スタックのセクションに `js-yaml`, `dotenv`, `@hono/node-server` 等の主要依存を追加し、バージョンは実装フェーズで `package.json` から正確に転記する旨を注記することを推奨する。

**[P1-3] `api-overview.md` の jobs.yaml スキーマに `google_books` 必須項目が未記載**

- **対象セクション**: 5.2 新ドキュメントの構成 > `docs/api-overview.md` > 設定インターフェース
- **内容**: RFC の jobs.yaml スキーマ構成案は `spec.md` から移行する内容を踏襲しているが、現行コードでは `google_books`（`printType`, `langRestrict`）がジョブごとの必須設定項目として追加されている。この情報は既存ドキュメントには存在しないが、新ドキュメントでは補完すべきである。
- **修正の期待値**: `api-overview.md` の構成案において、ジョブ設定スキーマに `google_books` セクション（`printType`, `langRestrict`）を明記し、必須項目である旨を記載することを推奨する。
