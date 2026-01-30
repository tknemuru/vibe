# [RFC] システム概要ドキュメントの作成

| 項目 | 内容 |
| :--- | :--- |
| **作成者 (Author)** | AI (Claude) |
| **ステータス** | Draft (起草中) |
| **作成日** | 2026-01-30 |
| **タグ** | docs, 優先度: 中 |
| **関連リンク** | CLAUDE.md「System Overview Documents」セクション |

## 1. 要約 (Summary)

- CLAUDE.md で定義された「システム概要ドキュメント」規約に基づき、`docs/architecture.md`・`docs/domain-model.md`・`docs/api-overview.md` の 3 ドキュメントを新規作成する。
- 既存の `docs/arch.md`・`docs/spec.md` の内容を新ドキュメントへ移行し、移行完了後に旧ファイルを削除する。
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
- 規約に準拠したドキュメント体系へ移行することで、各コマンド（`/imp`、`/rimp` 等）がシステム概要ドキュメントを正しく参照できるようになる。

## 3. 目的とスコープ (Goals & Non-Goals)

### 目的 (Goals)

- CLAUDE.md の「System Overview Documents」規約に準拠した 3 ドキュメントを作成する
- 既存ドキュメント（`arch.md`・`spec.md`）の有用な情報を漏れなく新ドキュメントへ移行する
- 既存ドキュメントの情報に加え、コードベース調査に基づく最新情報で内容を補完する

### やらないこと (Non-Goals)

- `docs/ops.md` の改廃（運用ガイドはシステム概要ドキュメントのスコープ外である）
- コードの変更（本 RFC はドキュメントのみの変更である）
- 他リポジトリへのシステム概要ドキュメント導入

## 4. 前提条件・依存関係 (Prerequisites & Dependencies)

- CLAUDE.md の「System Overview Documents」セクションが確定済みであること
- 既存ドキュメント（`arch.md`・`spec.md`・`ops.md`）の内容が現行コードベースと整合していること

## 5. 詳細設計 (Detailed Design)

### 5.1 既存ドキュメントの内容マッピング

既存ドキュメントの各セクションを新ドキュメントへ以下のように配置する。

| 既存ドキュメントのセクション | 移行先 |
|---|---|
| `arch.md` > コンポーネント責務 | `architecture.md` |
| `arch.md` > データフローと依存方向 | `architecture.md` |
| `arch.md` > ディレクトリ構成 | `architecture.md` |
| `arch.md` > 重要な設計判断 | `architecture.md` |
| `arch.md` > 失敗モードと設計上の扱い | `architecture.md` |
| `arch.md` > 再実行性・Idempotency | `architecture.md` |
| `arch.md` > 状態遷移の不変条件 | `domain-model.md` |
| `spec.md` > 目的・非目的・ユースケース | `architecture.md`（概要として） |
| `spec.md` > 外部インターフェース | `api-overview.md` |
| `spec.md` > 主要フロー | `architecture.md`（データフローに統合） |
| `spec.md` > データモデル | `domain-model.md` |
| `spec.md` > 設定項目 | `api-overview.md`（設定インターフェースとして） |
| `spec.md` > 不変条件・制約 | `domain-model.md` |
| `ops.md`（全体） | 移行しない（そのまま維持） |

### 5.2 新ドキュメントの構成

#### `docs/architecture.md` — システム構造の把握

```markdown
# DRE アーキテクチャ

## システム概要
- DRE の目的と全体像

## 技術スタック
- TypeScript 5.x / Node.js (ES2022)
- CLI: Commander
- DB: SQLite (better-sqlite3)
- メール: Nodemailer (SMTP)
- Web: Hono
- テスト: Vitest

## ディレクトリ構成
- src/ 配下のモジュール構造と責務

## コンポーネント構成
- Collect / Upsert / Select / Mail の責務と依存方向
- Web サーバー (Hono) の位置づけ

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
- 書籍 (Book)、ジョブ (Job)、配信 (Delivery)、クォータ (Quota)、カーソル (Cursor)

## 概念間の関係
- Job → Query → Book → Delivery の関係図

## 業務ルール・制約
- ISBN-13 一意性制約
- 未配信優先選択ルール
- 日次クォータ管理（JST リセット）
- ページングカーソルと枯渇検出

## 状態遷移
- 書籍の配信状態: 未配信 → 配信済み（リセットにより戻り可）
- クォータカウンタ: 0 → DAILY_BOOKS_API_LIMIT（日次リセット）
- カーソル: 初回 → 継続 → 枯渇（リセットにより初回へ）

## データ永続化

### books テーブル
- isbn13, title, authors, delivered, delivered_at, job_name 等

### collect_cursor テーブル
- job_name, query_set_hash, start_index, is_exhausted 等

### その他テーブル
- コードベース調査に基づき補完
```

#### `docs/api-overview.md` — インターフェース設計の把握

```markdown
# DRE インターフェース概要

## CLI インターフェース
- コマンド体系（job, run-due, mail, doctor, db, serve）
- 各コマンドのサブコマンドとオプション

## Web サーバーエンドポイント
- Hono ベースの Web サーバー (ポート 8787)
- /prompt 等のエンドポイント一覧

## 外部サービス連携
### Google Books API
- 認証方式（API キー）
- レート制限とクォータ管理

### SMTP (Gmail)
- 認証方式（アプリパスワード）
- 設定項目

## 設定インターフェース
### 環境変数 (.env)
- 各変数の一覧と説明

### ジョブ設定 (config/jobs.yaml)
- YAML スキーマと設定項目

## エラーハンドリング規約
- 各外部連携のエラーパターンと対処方針
```

### 5.3 既存ファイルの削除

新ドキュメント作成完了後、以下のファイルを削除する。

- `docs/arch.md`
- `docs/spec.md`

`docs/ops.md` は運用ガイドとして維持する。ops.md 内に arch.md や spec.md への参照がある場合は、新ドキュメントへの参照に更新する。

## 6. 代替案の検討 (Alternatives Considered)

### 案A: 新規作成＋旧ドキュメント削除（採用案）

- **概要**: 規約に準拠した 3 ドキュメントを新規作成し、内容移行後に `arch.md`・`spec.md` を削除する。`ops.md` は維持する。
- **長所**: 規約と完全一致する構成になる。重複ドキュメントが残らず、メンテナンス対象が明確である。
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

- 案A を採用する。DRE は個人プロジェクトであり、旧ドキュメントへの外部参照は存在しない。Git 履歴も `arch.md` の内容が大幅に再構成されるため保持の意義が薄い。重複のない明確な構成を一度に実現する案A が最も合理的である。

## 7. 横断的関心事 (Cross-Cutting Concerns)

### 7.1 セキュリティとプライバシー

- 該当なし（ドキュメントのみの変更であり、コード変更を含まない）

### 7.2 スケーラビリティとパフォーマンス

- 該当なし

### 7.3 可観測性 (Observability)

- 該当なし

### 7.4 マイグレーションと後方互換性

- `docs/arch.md` および `docs/spec.md` を削除するため、これらを参照しているドキュメントやスクリプトがあれば更新が必要である。
- `docs/ops.md` 内に旧ドキュメントへの参照がないか確認し、あれば新ドキュメントへの参照に更新する。
- ロールバックは Git revert で対応可能である。

## 8. テスト戦略 (Test Strategy)

- ドキュメントのみの変更であるため、自動テストは不要である。
- 検証項目:
  - 新ドキュメント 3 ファイルが `docs/` 直下に存在すること
  - `docs/arch.md`・`docs/spec.md` が削除されていること
  - `docs/ops.md` が変更なく維持されていること
  - 各ドキュメントの Markdown が正しく描画されること（PR プレビューで確認）
  - 既存ドキュメントの情報が漏れなく新ドキュメントに移行されていること

## 9. 実装・リリース計画 (Implementation Plan)

以下のフェーズで実施する。

### フェーズ 1: ドキュメント作成

1. コードベースを調査し、既存ドキュメントに記載されていない最新情報を把握する
2. `docs/architecture.md` を作成する
3. `docs/domain-model.md` を作成する
4. `docs/api-overview.md` を作成する

### フェーズ 2: 旧ドキュメント削除と参照更新

5. `docs/ops.md` 内の旧ドキュメント参照を確認し、必要に応じて更新する
6. `docs/arch.md` を削除する
7. `docs/spec.md` を削除する

### フェーズ 3: 検証

8. 新ドキュメントの内容が既存情報を網羅しているか確認する
9. Markdown の描画を PR 上で確認する

### システム概要ドキュメントへの影響

本 RFC 自体がシステム概要ドキュメントの新規作成を目的としているため、`docs/architecture.md`・`docs/domain-model.md`・`docs/api-overview.md` が本 RFC の成果物として作成される。
