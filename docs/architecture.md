# DRE アーキテクチャ

## システム概要

DRE（DeepResearch Email）は、書籍収集と DeepResearch 支援メール配信を行う CLI ベースのシステムである。

- Google Books API で書籍情報を収集する
- 収集した書籍に DeepResearch 用プロンプトを付与してメール配信する
- ジョブ単位で収集クエリと配信を管理する
- Web サーバーでプロンプトの Copy ページを提供する

### スコープ

**目的:**

- 書籍収集と DeepResearch 支援メール配信
- ジョブ単位での収集・配信管理

**非目的:**

- 書籍の全文検索・閲覧機能
- 複数ユーザーへの同時配信
- リアルタイム通知

### ユースケース

1. ユーザーがジョブ（検索クエリ群）を登録する
2. 定期実行により Google Books API から書籍を収集する
3. 未配信の書籍を優先選択し、DeepResearch プロンプト付きメールを配信する
4. メール内の Copy リンクからプロンプトをクリップボードにコピーする
5. 配信済み書籍は再配信されない（明示的なリセット操作を除く）

## 技術スタック

| カテゴリ | 技術 | バージョン |
|----------|------|------------|
| 言語 | TypeScript | 5.9 |
| ランタイム | Node.js | ES2022 (ESM) |
| CLI | Commander | 14.x |
| DB | SQLite (better-sqlite3) | 12.x |
| メール | Nodemailer | 7.x (SMTP) |
| Web | Hono (@hono/node-server) | 4.x |
| 設定 | js-yaml (YAML), dotenv (環境変数) | 4.x, 17.x |
| テスト | Vitest | 3.x |
| ビルド | tsc, 開発実行: tsx | — |

## ディレクトリ構成

### プロジェクトルート

```
dre/
├── config/
│   └── jobs.yaml          # ジョブ設定
├── data/
│   └── app.db             # SQLite データベース（自動生成）
├── dist/                  # ビルド済み JavaScript
├── docs/                  # ドキュメント
├── src/                   # TypeScript ソースコード
├── templates/             # Editorial テンプレート群・ルーティング定義（SoT）
│   ├── prompts/           # 判定プロンプト群・Editorial テンプレート群
│   └── routing/           # ルーティング定義・書籍タイプ分類
├── test/                  # テストファイル
├── .env                   # 環境変数（Git 管理外）
├── .env.example           # 環境変数テンプレート
├── package.json           # プロジェクト定義
├── tsconfig.json          # TypeScript 設定
└── vitest.config.ts       # テスト設定
```

### src/ ディレクトリ

```
src/
├── cli.ts                 # CLI エントリーポイント
├── collectors/            # 書籍データ収集
│   ├── index.ts           # Collector インターフェース・型定義
│   └── google-books.ts    # Google Books API コレクター
├── commands/              # CLI コマンド
│   ├── db.ts              # DB 管理 (reset, info)
│   ├── doctor.ts          # 設定診断
│   ├── job.ts             # ジョブ管理 (ls, add, rm, etc.)
│   ├── mail.ts            # 配信管理 (reset, status)
│   ├── run-due.ts         # メインパイプライン実行
│   └── serve.ts           # Web サーバー起動
├── config/                # 設定管理
│   └── jobs.ts            # jobs.yaml パーサー・バリデーター
├── db/                    # データアクセス・永続化
│   ├── init.ts            # DB 初期化・マイグレーション
│   └── dao.ts             # データアクセスオブジェクト
├── server/                # Web サーバー
│   ├── index.ts           # Hono アプリファクトリ
│   ├── routes/
│   │   └── prompt.ts      # プロンプトトークンルート
│   └── views/
│       └── copy-page.ts   # Copy ページ HTML テンプレート
├── services/              # ビジネスロジック
│   ├── mailer.ts          # メール配信サービス
│   └── prompt-builder.ts  # DeepResearch プロンプト生成
└── utils/                 # ユーティリティ
    ├── hash.ts            # クエリハッシュ（ページング用）
    └── quota.ts           # API クォータ管理
```

## レイヤー構造と依存関係

```
commands → services → db
              ↓
          collectors → 外部 API (Google Books)
              ↓
          utils (quota, hash)
```

- `commands/` は CLI のエントリーポイントであり、`services/` と `db/` を利用する
- `services/` はビジネスロジックを担い、`db/` や外部サービス（SMTP）に依存する
- `collectors/` は外部 API（Google Books）との境界を担当する
- `db/` は SQLite への永続化を担当し、外部依存を持たない
- `server/` は Hono ベースの Web サーバーであり、`db/` を利用してトークン検証を行う

## コンポーネント構成

### Collect

- Google Books API へクエリを発行し、書籍情報を取得する
- クォータ管理（日次上限）を担当する
- カーソルベースのページングで結果を順次取得する
- 取得結果を後続の Upsert に渡す

### Upsert

- 取得した書籍を DB に保存する
- ISBN-13 をキーとした重複排除を行う
- 既存レコードがあれば更新（`last_seen_at` 更新）、なければ挿入

### Select

- 配信対象の書籍をジョブ単位で選択する
- 未配信書籍（`delivery_items` に未登録）を優先的に選択する
- 未配信がなければ、過去配信済み書籍からフォールバック選択する

### Mail

- 選択された書籍に DeepResearch プロンプトを付与してメール送信する
- プロンプトごとにアクセストークン（30日有効）を発行する
- 送信成功後、`deliveries`（監査ログ）と `delivery_items`（SSOT）に記録する
- `books.last_delivered_at` も更新する（後方互換性）

### Web サーバー (Hono)

- Copy ページによるプロンプト閲覧機能を提供する
- トークンベースのアクセス制御（32文字 hex トークン、30日有効期限）
- ヘルスチェックエンドポイント

## データフロー

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Collect   │ --> │   Upsert    │ --> │   Select    │ --> │    Mail     │
│ Google Books│     │   SQLite    │     │   SQLite    │     │    SMTP     │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
      │                   │                   │                   │
      v                   v                   v                   v
  外部 API            内部 DB             内部 DB            外部 SMTP
                                                                │
                                                                v
                                                          ┌───────────┐
                                                          │ Web Server│
                                                          │  (Hono)   │
                                                          │ Copy ページ│
                                                          └───────────┘
```

- 依存方向は左から右への単方向
- 各コンポーネントは前段の出力を入力として受け取る
- 外部依存（Google Books API, SMTP）は境界で分離
- Mail が生成したプロンプトトークンを Web サーバーが提供する

### パイプライン詳細（`dre run-due`）

1. 各ジョブの実行間隔をチェックし、due なジョブを特定する
2. due なジョブごとに Google Books API から書籍を収集する（Collect）
3. 収集した書籍を DB に Upsert する
4. ジョブごとに未配信書籍を選択する（Select）
5. 選択された書籍に DeepResearch プロンプトを生成する
6. プロンプトごとにアクセストークンを発行し、Copy リンクを生成する
7. ダイジェストメールを送信する（Mail）
8. 配信記録を `deliveries` + `delivery_items` テーブルに記録する

## Editorial レイヤー（テンプレート・ルーティング）

### 概要

書籍の「興味判定」と「Editorial 編集」を行うレイヤーである。LLM（gpt-4o-mini）を活用し、書籍ごとの関心度判定と読者体験に最適化された編集出力を行う。

テンプレート群とルーティング定義は `templates/` 配下に SoT として配置されている。ルーティングの SoT は `templates/routing/routing_rules.yaml` である。

### データフロー

```
Books → interest_filter（判定）
         │
         ├── interested=false → 配信なし（保存のみ）
         │
         └── interested=true
              │
              ├── intellectual_pleasure（判定）
              ├── thinking_fiction（判定）
              │
              └── interest_filter の confidence による分岐
                   ├── high → Editorial-Lite
                   │          ├── thinking_fiction=true → Deep（自動発火）
                   │          └── book_type=dictionary → Follow-up（自動発火）
                   ├── medium → Medium-Lite
                   └── low → Nano-Lite
```

### confidence 段階制御

`interest_filter` ステージの `confidence` 出力（`high` / `medium` / `low` の列挙値）により、生成する Editorial の種別を分岐する。

| confidence | 出力テンプレート | 字数目安 |
|-----------|-----------------|---------|
| high | Editorial-Lite | 800〜1200字 |
| medium | Medium-Lite | 600〜900字 |
| low | Nano-Lite | 200〜350字 |

LLM が期待外の値を返却した場合は `low`（フォールバック）として扱う。

### Deep / Follow-up 自動発火

Deep / Follow-up はデフォルトで自動発火しない。`confidence=high` の場合のみ、以下の条件で自動発火する。

- **Deep（思考型フィクション専用）**: `thinking_fiction=true` かつ `book_type` が `dictionary` でない場合
- **Follow-up（具体解編）**: `book_type=dictionary` の場合

### 既定 LLM モデル

判定・生成ともに **gpt-4o-mini** を標準採用する。モデル指定は `templates/routing/routing_rules.yaml` で管理する。

## 重要な設計判断

### ISBN-13 での重複排除

- **判断**: ISBN-13 を書籍の一意キーとして採用
- **理由**: 国際的に標準化された識別子であり、重複配信を防止できる
- **トレードオフ**: ISBN のない書籍は収集対象外となる

### 未配信優先 → フォールバック戦略

- **判断**: 未配信書籍を優先し、枯渇時は配信済みから再選択
- **理由**: 新規書籍を優先しつつ、配信停止を回避する
- **トレードオフ**: 長期運用で同じ書籍が再配信される可能性がある

### ジョブ単位の実行間隔管理

- **判断**: ジョブごとに `interval` と `last_run` を管理
- **理由**: クエリごとに適切な頻度で実行し、API クォータを効率的に使用する
- **トレードオフ**: ジョブ数が増えると管理が複雑になる

### 単一配信先

- **判断**: `MAIL_TO` は単一メールアドレスのみ対応
- **理由**: 個人利用を想定した MVP 設計
- **トレードオフ**: 複数配信先には対応しない

### SSOT としての delivery_items（Ver4.0）

- **判断**: 配信状態の正（SSOT）を `delivery_items` テーブルに集約
- **理由**: ジョブ単位の配信追跡を正確に行い、`UNIQUE(job_name, isbn13)` で重複配信を防止する
- **トレードオフ**: `books.last_delivered_at` との二重管理が発生する（後方互換性のため維持）

## 失敗モードと復旧

### Google Books API 失敗

- **症状**: ネットワークエラー、認証エラー、レート制限
- **扱い**: エラーログを出力し、該当クエリをスキップ。他のクエリは継続実行
- **復旧**: 次回実行で自動リトライ

### SMTP 失敗

- **症状**: 接続エラー、認証エラー、送信エラー
- **扱い**: エラーログを出力。配信済みフラグは更新しない
- **復旧**: 次回実行で未配信として再選択される

### DB 失敗

- **症状**: SQLite ファイルアクセスエラー、スキーマ不整合
- **扱い**: 致命的エラーとして処理を中断
- **復旧**: `dre db reset` でリセット、またはバックアップから復元

### クォータ超過

- **症状**: `DAILY_BOOKS_API_LIMIT` に到達
- **扱い**: 警告ログを出力し、Collect をスキップ。翌日（JST）に自動リセット
- **復旧**: 手動での介入は不要

## 再実行性・べき等性

| コンポーネント | べき等性 | 備考 |
|----------------|----------|------|
| Collect | 安全（API 呼び出しのみ） | クォータ消費は発生する |
| Upsert | べき等 | 同一 ISBN-13 は更新のみ、重複挿入されない |
| Select | べき等ではない | 実行タイミングで選択結果が変わる可能性あり。未配信優先のルールは常に適用される |
| Mail | べき等ではない | 同一書籍の再送信は可能。配信記録更新により、通常は再送信されない |

## デプロイ構成

- **Web サーバー**: systemd サービス (`dre-serve.service`) でデーモン化
- **定期実行**: cron による `dre run-due` の定期実行
- **ビルド**: `tsc` で TypeScript をコンパイルし、`dist/` に出力
- **実行**: `node dist/cli.js` または `dre` コマンド（`bin` 設定による）
