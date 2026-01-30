# [RFC] Editorial テンプレート群・判定プロンプト群・ルーティング定義の正式登録

| 項目 | 内容 |
| :--- | :--- |
| **作成者 (Author)** | Claude (RFC Author) |
| **ステータス** | Draft (起草中) |
| **作成日** | 2026-01-31 |
| **タグ** | editorial, templates, routing |
| **関連リンク** | — |

## 1. 要約 (Summary)

- DRE の Editorial レイヤーを構成するテンプレート群（Lite / Medium-Lite / Nano-Lite / Deep / Follow-up）、判定プロンプト群（Interest / Intellectual Pleasure / Thinking Fiction）、およびルーティング定義（発火条件テーブル・書籍タイプ分類）を、正式テンプレ（SoT: Single Source of Truth）としてリポジトリに登録する。
- 現在の DRE は書籍収集→静的プロンプト生成→メール配信のパイプラインであるが、本提案により LLM（gpt-4o-mini）を活用した判定・編集レイヤーの定義基盤を追加する。
- テンプレ本文・ルーティング定義・ドキュメント更新・最低限のテストを一括で登録し、実装契約としての SoT を確立する。

## 2. 背景・動機 (Motivation)

- DRE の目的は「短時間で効率よく興味のある知識を吸収し、知的好奇心を満たす体験の最大化」と「幅広い知識を身に着けて IT コンサル業務に活かす」ことである。
- 現行の DRE パイプライン（`src/commands/run-due.ts`）は Collect → Upsert → Select → Mail の流れで動作するが、書籍の「興味判定」と「Editorial 編集」のレイヤーが存在しない。現在の `src/services/prompt-builder.ts` は DeepResearch 用の静的プロンプトを生成するのみであり、書籍ごとの関心度判定や読者体験に最適化された編集出力は行っていない。
- 配信される書籍の「読みたい」と思える体験への編集（Editorial Layer）が体験の重要ポイントであり、これを実現するためのテンプレート群とルーティング定義を SoT としてリポジトリに登録する必要がある。
- テンプレートが正式に登録されていない状態では、判定・生成ロジックの実装に着手できず、テンプレートの変更管理やテストも行えない。

## 3. 目的とスコープ (Goals & Non-Goals)

### 目的 (Goals)

- `templates/` 配下に判定プロンプト群・Editorial テンプレート群を正式ファイルとして登録する
- `templates/routing/routing_rules.yaml` にルーティング定義（発火条件テーブル）を SoT として登録する
- `templates/routing/book_type.yaml` に書籍タイプ分類定義を登録する
- `docs/architecture.md`、`docs/domain-model.md`、`docs/api-overview.md`、`docs/ops.md` に Editorial レイヤーの設計情報を追記する
- テンプレ破壊検知・ルール妥当性検知の最低限テストを追加する
- 既定 LLM モデル（gpt-4o-mini）をドキュメントとルーティング定義の両方に明記する

### やらないこと (Non-Goals)

- UI 実装
- 個人最適化・学習ロジック（履歴からの嗜好学習等）
- 再評価ループ
- 配信基盤変更
- DB スキーマ変更
- LLM API 呼び出しの実装（テンプレートとルーティング定義の登録のみ）
- 生成品質のチューニングやモデル比較
- 書籍タイプの自動分類プロンプト

## 4. 前提条件・依存関係 (Prerequisites & Dependencies)

- 現行の DRE リポジトリ構造（TypeScript / Vitest / SQLite）がそのまま維持される前提である。
- テストは既存の Vitest 基盤に従い、新規テスト基盤の導入は行わない。
- テンプレート本文は元ネタ文章（実装契約）にそのまま従い、推測・補完による文章の追加は行わない。
- LLM API（gpt-4o-mini）の実際の呼び出し実装は本 RFC のスコープ外であり、将来の実装 RFC で扱う。

## 5. 詳細設計 (Detailed Design)

### 5.1 ディレクトリ構成

プロジェクトルート直下に `templates/` ディレクトリを新設し、以下の構成で配置する。

```
dre/
  templates/
    README.md
    prompts/
      interest_filter.system.md
      interest_filter.user.md
      intellectual_pleasure.system.md
      intellectual_pleasure.user.md
      thinking_fiction.system.md
      thinking_fiction.user.md
      editorial_lite.system.md
      editorial_lite.user.md
      medium_lite.system.md
      medium_lite.user.md
      nano_lite.system.md
      nano_lite.user.md
      followup.system.md
      followup.user.md
      deep_thinking_fiction.system.md
      deep_thinking_fiction.user.md
    routing/
      routing_rules.yaml
      book_type.yaml
```

### 5.2 テンプレート設計

#### ファイル命名規約

- `{機能名}.system.md` — LLM の system プロンプト
- `{機能名}.user.md` — LLM の user プロンプト（差し込み変数を含む）

#### 変数規約（全テンプレート共通）

テンプレート本文に含める差し込み変数名は以下に統一する。

- `{{book.title}}`
- `{{book.authors}}`
- `{{book.published}}`
- `{{book.description}}`

これは `src/services/prompt-builder.ts` の `buildDeepResearchPrompt()` が利用する書籍情報（`Book` 型の `title`, `authors_json`, `published_date`, `description`）に対応する。

#### 判定プロンプト群（3種）

| プロンプト | 目的 | 出力 |
|-----------|------|------|
| interest_filter | Editorial を作る価値があるかの判定 | `{interested, confidence, reason}` |
| intellectual_pleasure | 知的快楽型かの判定 | `{intellectual_pleasure, confidence, reason}` |
| thinking_fiction | 思考型フィクションかの判定 | `{thinking_fiction, confidence, reason}` |

#### Editorial テンプレート群（5種）

| テンプレート | 目的 | 字数目安 |
|-------------|------|---------|
| editorial_lite | 3〜4分で読み切れる Editorial | 800〜1200字 |
| medium_lite | 30〜60秒で読むかどうか判断させる | 600〜900字 |
| nano_lite | 5〜10秒で「読まない」と即断させる | 200〜350字 |
| followup | Deep Follow-up（具体解編・選択肢マップ） | 1200〜1800字 |
| deep_thinking_fiction | 思考型フィクション専用 Deep | 1800〜2600字 |

#### テンプレート本文

各テンプレートの本文は元ネタ文章（実装契約）に記載された内容をそのままファイル化する。推測や補完による追加は行わない。

### 5.3 ルーティング定義

#### routing_rules.yaml

LLM モデル指定、判定ステージ、出力ルーティング、自動発火条件を定義する SoT である。

```yaml
llm:
  default_model: gpt-4o-mini

stages:
  interest_filter:
    model: gpt-4o-mini
    output: [interested, confidence]
  intellectual_pleasure:
    model: gpt-4o-mini
    output: [intellectual_pleasure, confidence]
  thinking_fiction:
    model: gpt-4o-mini
    output: [thinking_fiction, confidence]

output_routing:
  by_confidence:
    high: editorial_lite
    medium: medium_lite
    low: nano_lite

auto_triggers:
  deep:
    enabled: true
    allow:
      - confidence: high
        thinking_fiction: true
    deny:
      - book_type: dictionary
  followup:
    enabled: true
    allow:
      - confidence: high
        book_type: dictionary
    deny:
      - confidence: medium
      - confidence: low

notes:
  - "medium/low は自動 Deep/Follow-up を禁止（人手トリガは実装スコープ外）"
  - "辞書型は Deep 禁止、Follow-up が主"
  - "思考型フィクションは Deep が主"
```

設計のポイント:

- `interested=false` の場合は配信しない（保存のみ。既存の `src/commands/run-due.ts` のパイプラインには影響しない）
- `interested=true` の場合、`confidence` によって出力段階を分岐する（high → Lite、medium → Medium-Lite、low → Nano-Lite）
- Deep / Follow-up はデフォルトで自動発火しない。自動発火は `confidence=high` の場合のみ許可する
- 辞書型（dictionary）は Deep 禁止、Follow-up 優先
- 思考型フィクション（`thinking_fiction=true`）は Deep 優先

#### book_type.yaml

書籍タイプ分類の定義ファイルである。自動分類プロンプトは本 RFC のスコープ外とする。

```yaml
types:
  question:
    label: "問い型"
    description: "なぜ／どう考えるが中心。前提を揺さぶる。"
  dictionary:
    label: "辞書型"
    description: "フレーム／スキーム／一覧など道具箱的。使い方の地図が価値。"
  practice:
    label: "実践型"
    description: "手順・ケース・HowTo。行動に落とす。"
```

### 5.4 データフロー（将来の実装時）

本 RFC はテンプレートとルーティング定義の登録のみであるが、将来の実装時のデータフローを示す。

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
              └── confidence による分岐
                   ├── high → Editorial-Lite
                   │          ├── thinking_fiction=true → Deep（自動発火）
                   │          └── book_type=dictionary → Follow-up（自動発火）
                   ├── medium → Medium-Lite
                   └── low → Nano-Lite
```

### 5.5 ドキュメント更新

以下の既存ドキュメントに Editorial レイヤーの情報を追記する。

#### docs/architecture.md

- Books → 判定レイヤー → Editorial レイヤー → Mail のデータフロー
- `routing_rules.yaml` が SoT であること
- confidence 段階制御（high/medium/low）と出力の関係
- 思考型フィクション Deep の位置づけ

#### docs/domain-model.md

- **[仮定]** 本 RFC では DB スキーマ変更はスコープ外のため、domain-model.md への追記は不要と判断する。将来の LLM 判定結果の永続化が必要になった際に更新する。

#### docs/api-overview.md

- **[仮定]** 本 RFC では新規 API エンドポイントの追加はスコープ外のため、api-overview.md への追記は不要と判断する。

#### docs/ops.md

- テンプレート更新手順（変更 → テスト → レビュー）
- 破壊的変更の禁止事項（必須構造、アンカー密度など）
- 既定モデル変更は `routing_rules.yaml` と docs の両方を更新する必要があること

### 5.6 テスト設計

既存の Vitest 基盤（`vitest.config.ts`）に従い、以下のテストを追加する。

**テストファイル**: `test/templates/templates.test.ts`

```typescript
// テストケース（概要）
describe('routing_rules.yaml', () => {
  it('必須キーが存在すること（llm.default_model, output_routing.by_confidence, auto_triggers）')
  it('default_model が gpt-4o-mini であること')
})

describe('templates/prompts', () => {
  it('全 md ファイルが空でないこと')
  it('変数プレースホルダが {{book.*}} 以外を使用していないこと')
})

describe('deep_thinking_fiction.system.md', () => {
  it('必須構造の文言が含まれること（0〜7 の見出し）')
  it('アンカー密度 6〜10 の要件が記述されていること')
})
```

## 6. 代替案の検討 (Alternatives Considered)

### 案A: テンプレートをコード内（TypeScript）に埋め込む

- **概要**: テンプレート本文を TypeScript の文字列リテラルとして `src/templates/` 配下に配置する
- **長所**: 型安全性が確保され、変数の差し込みがコンパイル時に検証される。追加の YAML パーサーが不要。
- **短所**: テンプレートの編集にコードの知識が必要になる。ビルドなしでの確認ができない。マークダウンの視認性が悪い。

### 案B: 独立ファイル（Markdown + YAML）として配置する（採用案）

- **概要**: テンプレートは `.md` ファイル、ルーティング定義は `.yaml` ファイルとして `templates/` 配下に独立配置する
- **長所**: テンプレートの視認性・編集容易性が高い。非エンジニアでも内容を確認・修正できる。SoT が明確で、コードとテンプレートの関心が分離される。
- **短所**: 変数名の整合性はテストで担保する必要がある（コンパイル時検証がない）。

### 選定理由

- テンプレートは「実装契約」としての性質を持ち、本文の視認性と編集容易性が最優先である。
- 変数名の整合性はテスト（プレースホルダ検証）で十分に担保できる。
- 元ネタ文章が `.md` ファイルとしての登録を明示的に指定している。

## 7. 横断的関心事 (Cross-Cutting Concerns)

### 7.1 セキュリティとプライバシー

- テンプレートファイルは静的なマークダウンであり、セキュリティ上の懸念はない。
- LLM API キーなどの秘匿情報はテンプレートに含めない（実装時に環境変数から取得する設計）。

### 7.2 スケーラビリティとパフォーマンス

- テンプレートファイルの読み込みは起動時または初回利用時の1回のみであり、パフォーマンスへの影響は軽微である。

### 7.3 可観測性 (Observability)

- 本 RFC のスコープでは新規ログやメトリクスは不要である。
- 将来の LLM 判定・生成実装時に、判定結果とルーティング選択のログを追加する。

### 7.4 マイグレーションと後方互換性

- 本 RFC は新規ファイルの追加のみであり、既存コード・DB スキーマ・API への変更はない。
- 後方互換性の問題は発生しない。
- ロールバックは追加ファイルの削除のみで完了する。

## 8. テスト戦略 (Test Strategy)

- **テスト種別**: ユニットテスト（Vitest）
- **テスト対象**:
  1. `routing_rules.yaml` の必須キー存在（`llm.default_model`, `output_routing.by_confidence`, `auto_triggers` など）
  2. `templates/prompts/` 配下の全 `.md` ファイルが空でないこと
  3. 変数プレースホルダが規約外を使用していないこと（`{{book.*}}` 以外の誤記を検知）
  4. `deep_thinking_fiction.system.md` に必須構造の文言が含まれること（セクション 0〜7、アンカー密度 6〜10 の要件）
- **境界値・エッジケース**: テンプレートが空ファイル、不正な変数名、YAML 構文エラーの検知

## 9. 実装・リリース計画 (Implementation Plan)

### フェーズ 1: テンプレート・ルーティング定義の登録

1. `templates/` ディレクトリ構成の作成
2. 判定プロンプト群（6ファイル）の登録
3. Editorial テンプレート群（10ファイル）の登録
4. `routing_rules.yaml` の登録
5. `book_type.yaml` の登録
6. `templates/README.md` の作成

### フェーズ 2: ドキュメント更新

1. `docs/architecture.md` に Editorial レイヤーのデータフロー・ルーティング SoT を追記
2. `docs/ops.md` にテンプレート更新手順・破壊的変更禁止事項を追記

### フェーズ 3: テスト追加

1. `test/templates/templates.test.ts` の作成
2. 全テスト実行・グリーン確認

### 検証方法

- `npm test` で全テストが通ること
- `templates/prompts/` 配下に 16 ファイルが存在すること
- `routing_rules.yaml` と `book_type.yaml` が正しい YAML として読み込めること
- ドキュメントに既定モデル（gpt-4o-mini）と発火方針が明記されていること

### システム概要ドキュメントへの影響

| ドキュメント | 影響 | 対応内容 |
|---|---|---|
| `docs/architecture.md` | あり | Editorial レイヤーのデータフロー、ルーティング SoT、confidence 段階制御を追記 |
| `docs/domain-model.md` | なし | DB スキーマ変更がスコープ外のため更新不要 |
| `docs/api-overview.md` | なし | 新規 API エンドポイントがスコープ外のため更新不要 |
| `docs/ops.md` | あり | テンプレート更新手順、破壊的変更禁止事項、既定モデル変更手順を追記 |
