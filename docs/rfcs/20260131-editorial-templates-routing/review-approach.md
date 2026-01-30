## Approach Reviewer によるレビュー結果

### 1. 判定 (Decision)

- **Status**: Approve

**判定基準:** P0 が0件のため Approve とする。

### 2. 良い点 (Strengths)

- **セクション 2（背景・動機）**: 課題の定義が正確である。現行パイプラインには「興味判定」と「Editorial 編集」のレイヤーが存在せず、`prompt-builder.ts` が DeepResearch 用の静的プロンプトを生成するのみであるという現状分析は、実際のコードベース（`buildDeepResearchPrompt()` の単一関数構成）と整合している。テンプレートが SoT として未登録では実装に着手できないという動機も、開発ライフサイクル上の依存関係として論理的に正当である。

- **セクション 3（Goals / Non-Goals の線引き）**: 本 RFC のスコープを「テンプレートとルーティング定義の登録」に厳密に限定し、LLM API 呼び出しの実装、DB スキーマ変更、生成品質チューニング等を明確に除外している。この線引きには論理的根拠がある。テンプレートは実装契約であり、契約の確定（SoT 登録）と契約の履行（実装）を分離することで、レビュー粒度の適切化とロールバック容易性を確保している。

- **セクション 5.2（変数規約の改善）**: 初回レビューで指摘された `{{book.authors}}` の型曖昧性、`{{book.published}}` と `published_date` の命名不一致、`{{book.publisher}}` の欠落が全て解消されている。変数と `Book` 型フィールドの対応表に「差し込み時の変換ルール」列が追加され、実装時のマッピング混乱を防止する設計判断が明文化されている。

- **セクション 5.3（confidence 定義の明確化）**: 初回レビューで指摘された `confidence` の出力形式未定義問題が解消されている。`confidence` セクションが `routing_rules.yaml` のトップレベルに追加され、`type: enum`、`values: [high, medium, low]`、`fallback: low` が明記されている。また `confidence_source: interest_filter` により、どのステージの confidence がルーティングに使用されるかも一義的に定義されている。

- **セクション 5.3（interested=false の扱い）**: 初回レビューで指摘された「既存パイプラインには影響しない」の表現曖昧性が解消されている。「本 RFC のスコープではコード変更を伴わないため、現時点では既存の `src/commands/run-due.ts` のパイプラインに影響しない。将来の LLM 判定実装時には、Select フェーズの前段にフィルタリングロジックを追加する必要があり、パイプラインへの変更が発生する」と、現時点と将来の影響を明確に区別して記載されている。

- **セクション 6（代替案の検討）**: テンプレートを TypeScript 埋め込みにせず Markdown + YAML として独立配置する判断は、本システムの性質に対して妥当である。テンプレートは LLM への入力プロンプトであり、その視認性と編集容易性を最優先すべきである。変数名の整合性はテストで担保する方針も代替案 B の弱点を適切に補完している。

### 3. 指摘事項 (Issues)

#### Severity 定義

| Severity | 定義 |
| :--- | :--- |
| **P0 (Blocker)** | 修正必須。論理的欠陥、仕様漏れ、重大なリスク、回答必須の質問 |
| **P1 (Nit)** | 提案。より良い手法、軽微な懸念、参考情報 |

#### 指摘一覧

**[P1-1] `intellectual_pleasure` / `thinking_fiction` ステージの confidence がルーティングに使用されない理由の明記**
- **対象セクション**: 5.3 ルーティング定義 > routing_rules.yaml
- **内容**: `routing_rules.yaml` の `confidence_source: interest_filter` により、ルーティングに使用する `confidence` が `interest_filter` ステージの出力であることは明示されている。また各ステージの `note` で `reason` がルーティングに使用されないことは記載されている。しかし、`intellectual_pleasure` および `thinking_fiction` ステージが出力する `confidence` がルーティングに使用されない理由（なぜログ・デバッグ用に限定するのか）が設計判断として記載されていない。これは設計の「なぜ」を示す情報であり、将来の拡張時に 3 ステージの confidence を組み合わせるべきか否かの判断材料となる。
- **修正の期待値**: セクション 5.3 の設計のポイント、または `routing_rules.yaml` の `notes` に、`intellectual_pleasure` / `thinking_fiction` の `confidence` をルーティングに使用しない設計判断の理由を一文追記すること。例: 「`interest_filter` の confidence は書籍全体への関心度を表すのに対し、`intellectual_pleasure` / `thinking_fiction` の confidence は特定属性の判定確度であり、出力テンプレートの粒度選択には関心度のみを用いるのが適切である」等。軽微であり、対応は任意とする。

**[P1-2] `auto_triggers` の allow 条件における AND/OR セマンティクスの未定義**
- **対象セクション**: 5.3 ルーティング定義 > routing_rules.yaml > auto_triggers
- **内容**: `auto_triggers.deep.allow` は `[{confidence: high, thinking_fiction: true}]` と定義されている。この配列要素内の複数条件（`confidence: high` かつ `thinking_fiction: true`）が AND 結合であるのか、配列の各要素が OR 結合であるのかのセマンティクスが RFC 上に明記されていない。現行定義では直感的に AND（同一要素内）と OR（配列間）と読み取れるが、YAML の構造からは一義的に解釈できず、将来の実装者が誤解するリスクがある。同様に `deny` の `[{confidence: medium}, {confidence: low}]` が OR 結合であることの明示も必要である。
- **修正の期待値**: `routing_rules.yaml` の `notes` セクションまたはセクション 5.3 の設計のポイントに、`allow`/`deny` 配列のセマンティクスを一文追記すること。例: 「`allow` / `deny` 配列内の各要素は OR 結合、要素内の複数キーは AND 結合として評価する」等。

**[P1-3] `book_type` の設定手段が未定義のままルーティングで参照される**
- **対象セクション**: 5.3 ルーティング定義 > routing_rules.yaml > auto_triggers / book_type.yaml
- **内容**: `auto_triggers` では `book_type: dictionary` を条件として使用しているが、`book_type` が書籍にどのように付与されるかの手段は本 RFC のスコープ外（Non-Goals に「書籍タイプの自動分類プロンプト」と記載）である。セクション 5.3 の `book_type.yaml` の説明に「将来的に自動分類プロンプトまたは手動で設定する」と記載されているものの、現時点では `book_type` を設定する手段が一切存在しないため、`auto_triggers` の `book_type` 条件は将来の実装まで事実上発火しない。これ自体は論理的な問題ではないが、SoT としてのルーティング定義が参照する属性の設定手段が未整備である旨を、設計のポイントに明示しておくと、将来の実装 RFC で扱うべきスコープが明確になる。
- **修正の期待値**: セクション 5.3 の設計のポイントまたは `routing_rules.yaml` の `notes` に、「`book_type` の設定手段は本 RFC のスコープ外であり、`auto_triggers` の `book_type` 条件は将来の分類実装後に機能する」旨を追記すること。対応は任意とする。
