## Technical Quality Reviewer によるレビュー結果

### 1. 判定 (Decision)

- **Status**: Approve

**判定基準:** P0 が0件のため Approve とする。

### 2. 良い点 (Strengths)

- **5.2 変数規約（全テンプレート共通）**: 前回レビューの P0-1 で指摘した `Book` 型フィールドとの不整合が全面的に解消されている。`{{book.published_date}}` への統一、`{{book.publisher}}` の追加、`{{book.authors}}` の差し込み値形式（パース済みカンマ区切り文字列）の明示はいずれも妥当であり、変数名と `Book` 型フィールド名の対応表・変換ルールの定義により、将来の実装時にマッピングの混乱が生じる余地がない。既存の `getBookAuthors()` → `join(", ")` パターンとの整合性も確保されている。

- **5.3 routing_rules.yaml**: 前回レビューの P0-2 で指摘した `intellectual_pleasure` ステージの出力フィールド名不整合が解消されている。全ステージの `output` に `reason` フィールドが追加され、`note` でルーティング未使用であることが明記された。また、前回 P1-3 で指摘した `confidence` のソースステージ不明確の問題が `output_routing.confidence_source: interest_filter` の追加で解決されている。P1-4 で指摘した `confidence` の値域定義も `confidence.type: enum` / `confidence.values: [high, medium, low]` / `confidence.fallback: low` として明確に定義された。全体として、ルーティング定義の SoT としての一貫性と完全性が大幅に向上している。

- **3. 目的とスコープ（やらないこと）**: LLM API 呼び出しの実装、生成品質チューニング、書籍タイプの自動分類プロンプトを明示的にスコープ外としている点は、RFC のスコープを「テンプレートとルーティング定義の登録」に厳密に限定する上で重要であり、Over-engineering の回避に寄与している。

- **5.1 ディレクトリ構成**: 前回 P1-1 で指摘した `config/` と `templates/` の棲み分け方針が明記された。`config/` はアプリケーション設定、`templates/` は LLM プロンプト・ルーティング定義という責務の分離は明確であり、将来の実装時に探索パスの混乱が生じにくい。

- **5.6 テスト設計**: 前回 P1-2 で指摘した `routing_rules.yaml` のスキーマバリデーション不足が解消されている。`stages` 配下の `model` / `output` キー検証、`output_routing.by_confidence` の3キー検証、`auto_triggers` の構造検証、`confidence` の enum 定義検証がテストケースに追加された。SoT の構造的整合性を担保する粒度として十分である。

- **5.2 外部データの安全性に関する方針**: プロンプトインジェクションとテンプレート構造破壊のリスクを識別し、本 RFC のスコープ外であることを明示しつつ、SoT としての方針（サニタイズ処理、防御的記述ガイドライン、system プロンプトでの防御的指示）を定めている。スコープの切り分けとリスク認識のバランスが妥当である。

- **7.4 マイグレーションと後方互換性**: 新規ファイルの追加のみでありロールバックはファイル削除で完了するという分析は正確である。既存の `src/commands/run-due.ts` パイプライン（Collect → Upsert → Select → Mail）に一切の変更を加えない設計は、リスクを最小化している。

### 3. 指摘事項 (Issues)

#### Severity 定義

| Severity | 定義 |
| :--- | :--- |
| **P0 (Blocker)** | 修正必須。論理的欠陥、仕様漏れ、重大なリスク、回答必須の質問 |
| **P1 (Nit)** | 提案。より良い手法、軽微な懸念、参考情報 |

#### 指摘一覧

**[P1-1] `auto_triggers` の `confidence` 参照元が暗黙的**

- **対象セクション**: 5.3 ルーティング定義 > routing_rules.yaml
- **内容**: `output_routing` セクションには `confidence_source: interest_filter` が明記されており、出力ルーティングで使用する `confidence` のソースが明確である。一方、`auto_triggers` セクションでも `confidence: high` を参照しているが、こちらの `confidence` がどのステージの出力値であるかは明記されていない。`output_routing` と同じく `interest_filter` の出力値を参照するのが自然であるが、`auto_triggers` 側にも `confidence_source` の指定またはコメントを追加すると、SoT としての一貫性がさらに向上する。
- **修正の期待値**: `auto_triggers` セクションに `confidence_source: interest_filter` を追加するか、`notes` に「`auto_triggers` の `confidence` も `interest_filter` ステージの出力値を参照する」旨を明記することを推奨する。

**[P1-2] `book_type.yaml` のテスト不在**

- **対象セクション**: 5.6 テスト設計 / 8. テスト戦略
- **内容**: テスト設計では `routing_rules.yaml` のスキーマ検証とテンプレートファイルの検証が記載されているが、`book_type.yaml` に対するテストが含まれていない。`book_type.yaml` も SoT の一部として登録されるファイルであり、`routing_rules.yaml` の `auto_triggers` で `book_type: dictionary` として参照される。`book_type.yaml` に `dictionary` キーが存在しない場合、ルーティング定義との整合性が崩れる。
- **修正の期待値**: テスト設計に `book_type.yaml` の基本検証を追加することを推奨する。最低限として (a) YAML として正しく読み込めること、(b) `types` キー配下に `routing_rules.yaml` の `auto_triggers` で参照される `dictionary` が存在すること、の2点で十分である。

**[P1-3] `deep_thinking_fiction` テンプレートの検証基準が他テンプレートと非対称**

- **対象セクション**: 5.6 テスト設計
- **内容**: `deep_thinking_fiction.system.md` に対しては必須構造（セクション 0〜7）とアンカー密度（6〜10）の詳細な構造検証が定義されているが、他の Editorial テンプレート（`editorial_lite`, `medium_lite`, `nano_lite`, `followup`）には空ファイル検知と変数プレースホルダ規約検証のみが適用される。これは `deep_thinking_fiction` が特に複雑な構造を持つためと推測されるが、テスト粒度の非対称性の理由が RFC に記載されていない。テンプレートの運用管理上、「なぜ `deep_thinking_fiction` だけ特別か」が将来の保守者に伝わりにくい。
- **修正の期待値**: `deep_thinking_fiction` の構造検証を追加した理由（例: 複数セクションと密度要件を持つ唯一のテンプレートであるため）を RFC 本文またはテストケースのコメントに簡潔に記載することを推奨する。必須ではないが、テスト設計意図の透明性が向上する。

**[P1-4] `interested=false` 時の挙動が `routing_rules.yaml` 自体に定義されていない**

- **対象セクション**: 5.3 ルーティング定義 > routing_rules.yaml
- **内容**: RFC 本文の「設計のポイント」では「`interested=false` の場合は配信しない（保存のみ）」と記載されているが、`routing_rules.yaml` の YAML 定義自体にはこのルールが記載されていない。`routing_rules.yaml` が SoT であるならば、`interested=false` 時の挙動も YAML 上に定義（または `notes` に明記）されているべきである。現状では RFC 本文を読まなければこのルールを把握できない。
- **修正の期待値**: `routing_rules.yaml` の `notes` に「`interested=false` の場合は配信対象外とする（保存のみ）。永続化方針は将来の実装 RFC で定義する」旨を追加することを推奨する。RFC 本文の記述が既にあるため、YAML への転記のみで対応可能である。
