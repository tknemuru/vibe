## Technical Quality Reviewer によるレビュー結果

### 1. 判定 (Decision)

- **Status**: Request Changes

**判定基準:** P0 が2件存在するため Request Changes とする。

### 2. 良い点 (Strengths)

- **6. 代替案の検討**: テンプレートを TypeScript 文字列リテラルに埋め込む案（案A）と独立ファイル（案B）の比較は的確である。テンプレートは「実装契約」としての性質を持ち、非エンジニアによる確認・修正の可能性を考慮すると、Markdown + YAML の独立ファイル方式は妥当な選択である。変数名の整合性をテストで担保するアプローチも過不足がない。

- **3. 目的とスコープ（やらないこと）**: LLM API 呼び出しの実装、生成品質チューニング、書籍タイプの自動分類プロンプトを明示的にスコープ外としている点は、RFC のスコープを「テンプレートとルーティング定義の登録」に限定する上で重要であり、Over-engineering の回避に寄与している。

- **5.2 テンプレート設計（ファイル命名規約・変数規約）**: `{機能名}.system.md` / `{機能名}.user.md` の命名規約と、`{{book.*}}` への変数統一は、テンプレート群の一貫性を保つ上で合理的である。テストでプレースホルダの規約外使用を検知する設計と組み合わせることで、将来の実装時にテンプレート変数の不整合を早期に発見できる。

- **5.6 テスト設計**: テンプレ破壊検知（空ファイル検知、変数プレースホルダ規約検証）とルーティング定義の必須キー検証に絞った最低限のテスト設計は、「テンプレートとルーティング定義の登録」というスコープに対して適切な粒度である。`deep_thinking_fiction.system.md` の必須構造検証（セクション0〜7、アンカー密度6〜10）も、テンプレートの構造的破壊を検知する上で有用である。

- **7.4 マイグレーションと後方互換性**: 新規ファイルの追加のみでありロールバックはファイル削除で完了するという分析は正確である。既存の `src/commands/run-due.ts` パイプライン（Collect → Upsert → Select → Mail）に一切の変更を加えない設計は、リスクを最小化している。

### 3. 指摘事項 (Issues)

#### Severity 定義

| Severity | 定義 |
| :--- | :--- |
| **P0 (Blocker)** | 修正必須。論理的欠陥、仕様漏れ、重大なリスク、回答必須の質問 |
| **P1 (Nit)** | 提案。より良い手法、軽微な懸念、参考情報 |

#### 指摘一覧

**[P0-1] テンプレート変数規約と既存 `Book` 型フィールドの不整合**

- **対象セクション**: 5.2 テンプレート設計 > 変数規約（全テンプレート共通）
- **内容**: RFC では変数を `{{book.title}}`、`{{book.authors}}`、`{{book.published}}`、`{{book.description}}` の4種と定義し、「`src/services/prompt-builder.ts` の `buildDeepResearchPrompt()` が利用する書籍情報（`Book` 型の `title`, `authors_json`, `published_date`, `description`）に対応する」と記載している。しかし、以下の不整合が存在する。
  1. `{{book.authors}}` は `Book` 型の `authors_json` に対応するとされるが、`authors_json` は JSON 文字列（`string | null`）であり、テンプレートに差し込む際のパース・フォーマット処理（`getBookAuthors()` → `join(", ")` 相当）の責務がテンプレート側にもコード側にも定義されていない。将来の実装時にテンプレートエンジンが `authors_json` をそのまま差し込むのか、パース済み文字列を差し込むのかが不明確である。
  2. `{{book.published}}` は `Book` 型の `published_date` に対応するとされるが、変数名が `published` であり `published_date` ではない。命名の不一致は将来の実装時にマッピングの混乱を招く。
  3. 既存の `buildDeepResearchPrompt()` は `publisher`（出版社）も利用しているが、テンプレート変数に `{{book.publisher}}` が含まれていない。判定プロンプト群では不要かもしれないが、Editorial テンプレート群での必要性が検討されていない。
- **修正の期待値**: テンプレート変数と `Book` 型フィールドの対応表を明示し、以下を解決すること。(a) `{{book.authors}}` に差し込まれる値の形式（JSON 文字列 or パース済みカンマ区切り文字列）を定義する。(b) `{{book.published}}` を `{{book.published_date}}` に統一するか、マッピングルールを明記する。(c) `{{book.publisher}}` の要否を明示的に判断し、必要であれば変数規約に追加する。

**[P0-2] `routing_rules.yaml` の `intellectual_pleasure` ステージ出力フィールドと判定プロンプト出力定義の不整合**

- **対象セクション**: 5.3 ルーティング定義 > routing_rules.yaml
- **内容**: `routing_rules.yaml` の `stages.intellectual_pleasure.output` は `[interested, confidence]` と定義されている。一方、セクション5.2の判定プロンプト群の表では `intellectual_pleasure` の出力は `{intellectual_pleasure, confidence, reason}` と定義されている。出力フィールド名が `interested` と `intellectual_pleasure` で異なっており、ルーティング定義とプロンプト出力仕様が矛盾している。`thinking_fiction` ステージも同様に、`stages.thinking_fiction.output` が `[thinking_fiction, confidence]` であるのに対し、プロンプト出力は `{thinking_fiction, confidence, reason}` であり、`reason` フィールドがルーティング定義に含まれていない。`interest_filter` も出力が `[interested, confidence]` だがプロンプト出力は `{interested, confidence, reason}` であり、`reason` が欠落している。ルーティング定義が SoT であるとするならば、プロンプト出力との整合性を担保しなければ、将来の実装時に出力パース処理が正しく動作しない。
- **修正の期待値**: (a) `intellectual_pleasure` ステージの `output` フィールド名をプロンプト出力定義と統一する（`interested` → `intellectual_pleasure` または逆方向の統一）。(b) 全ステージの `output` に `reason` フィールドを含めるか、`reason` はルーティングに使用しないため `output` には含めない旨を明記する。(c) `routing_rules.yaml` とプロンプト出力定義の対応関係を明確にする。

**[P1-1] テンプレートファイルの読み込みパスと既存 YAML 読み込みパターンの不整合**

- **対象セクション**: 5.1 ディレクトリ構成
- **内容**: 既存コードベースでは設定ファイルは `config/` ディレクトリ配下に配置し、`src/config/jobs.ts` にて `resolve(process.cwd(), "config/jobs.yaml")` で読み込んでいる。本 RFC では新たに `templates/` をプロジェクトルート直下に新設するが、`config/` と `templates/` の2つのルート直下ディレクトリにそれぞれ異なる種類の YAML ファイルが配置されることになる（`config/jobs.yaml` と `templates/routing/routing_rules.yaml`、`templates/routing/book_type.yaml`）。将来の実装時に YAML ファイルの探索パスが分散し、読み込みロジックの一貫性が損なわれる可能性がある。
- **修正の期待値**: 本 RFC のスコープでは実装を行わないため、ブロッカーとはしない。ただし、`config/` と `templates/` の棲み分け方針（例: `config/` はアプリケーション設定、`templates/` は LLM プロンプト・ルーティング定義）をセクション5.1 または `templates/README.md` の記載内容として明記することを推奨する。

**[P1-2] `routing_rules.yaml` のスキーマバリデーション方針の未定義**

- **対象セクション**: 5.6 テスト設計
- **内容**: テスト設計では `routing_rules.yaml` の必須キー存在チェック（`llm.default_model`, `output_routing.by_confidence`, `auto_triggers`）を行うとしているが、値の型や構造の検証（例: `stages` 配下の各ステージが `model` と `output` を持つこと、`auto_triggers` の `allow`/`deny` が配列であること）は記載されていない。`routing_rules.yaml` が SoT であることを考慮すると、キー存在のみの検証では構造破壊（キーは存在するが値が不正）を検知できない。
- **修正の期待値**: テストケースに以下を追加することを推奨する。(a) `stages` 配下の各ステージが `model` と `output` キーを持つこと。(b) `output_routing.by_confidence` が `high`, `medium`, `low` の3キーを持つこと。(c) `auto_triggers` 配下の各トリガーが `enabled`, `allow`, `deny` を持つこと。過度な検証は不要だが、SoT の構造的整合性を最低限担保する粒度は必要である。

**[P1-3] `output_routing.by_confidence` の分岐ロジックとデータフローの曖昧さ**

- **対象セクション**: 5.3 ルーティング定義 > routing_rules.yaml / 5.4 データフロー
- **内容**: `output_routing.by_confidence` は `high → editorial_lite`、`medium → medium_lite`、`low → nano_lite` と定義されている。しかし、`confidence` がどのステージの出力に由来するかが明記されていない。`interest_filter`、`intellectual_pleasure`、`thinking_fiction` の3ステージがそれぞれ `confidence` を出力するが、`output_routing` に使用される `confidence` がどのステージのものか（あるいは3つのうち最も高い/低いもの、`interest_filter` のもの等）が不明である。セクション5.4のデータフローでは「confidence による分岐」と記載されているのみで、具体的なマッピングルールがない。
- **修正の期待値**: `routing_rules.yaml` または RFC 本文に、`output_routing.by_confidence` で参照される `confidence` がどのステージの出力値であるかを明記すること。例えば「`interest_filter` ステージの `confidence` を使用する」等の定義が必要である。

**[P1-4] `confidence` の値域定義の欠如**

- **対象セクション**: 5.3 ルーティング定義 > routing_rules.yaml
- **内容**: `output_routing.by_confidence` および `auto_triggers` で `confidence` の値として `high`、`medium`、`low` を使用しているが、この値がどのように決定されるか（LLM の出力をそのまま使用するのか、数値をカテゴリに変換するのか）が定義されていない。判定プロンプト群の出力仕様では `confidence` の型や値域が未定義であり、`routing_rules.yaml` 側で `high`/`medium`/`low` の3段階を前提としているが、プロンプト側でこの3段階をどう指示するかが対応していない。テンプレート登録のみのスコープではあるが、SoT としてのルーティング定義が `confidence` の値域を定義していないと、将来の実装時にプロンプトとルーティングの不整合が生じる。
- **修正の期待値**: `routing_rules.yaml` に `confidence` の値域（`high`/`medium`/`low` の enum 定義）を明記するか、判定プロンプトの出力仕様に `confidence` のフォーマットを記載することを推奨する。

**[P1-5] 可観測性設計の将来方針が不十分**

- **対象セクション**: 7.3 可観測性 (Observability)
- **内容**: 「本 RFC のスコープでは新規ログやメトリクスは不要」「将来の LLM 判定・生成実装時に、判定結果とルーティング選択のログを追加する」と記載されているが、将来の実装で必要となるログの具体的な項目（例: 各ステージの判定結果、confidence 値、ルーティング先、LLM レスポンスタイム）が示されていない。`routing_rules.yaml` が SoT であるならば、ルーティング定義にログレベルやメトリクスのヒントを組み込む設計を検討する余地がある。
- **修正の期待値**: 本 RFC のスコープではブロッカーとしないが、将来の実装 RFC でカバーすべき可観測性要件（最低限: 各ステージの判定結果ログ、ルーティング選択ログ、LLM 呼び出しのレイテンシ）をノートとして記載することを推奨する。
