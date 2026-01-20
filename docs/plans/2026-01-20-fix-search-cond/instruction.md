Topic: 2026-01-20-fix-search-cond

Context:
Google Books 検索で no ISBN（industryIdentifiers に ISBN_13 / ISBN_10 が無い）な結果が大量に混入し、収集件数が直観より少なく見えている。
Phase 1 の観測ログにより、returned に対して skipped(no ISBN) が非常に高いことが確認できている。
今回は「検索条件の最小変更」で no ISBN 混入率を下げたい。

Goal:
1. API コール回数（ページ数）を増やさずに、no ISBN 混入率を下げる。
2. 変更前後で効果比較ができるよう、ログに検索条件と no ISBN 比率を明示する。
3. 既存の max_per_run / mail_limit / 重複排除（ISBN-13）などの基本挙動は変えない。

Scope (In):
1. Google Books API（volumes.list）への追加パラメータ
   1.1 printType=books を付与（書籍以外の混入を減らす）
   1.2 langRestrict=ja を付与（日本語クエリでは日本語中心に寄せる）
   1.3 既存の maxResults 決定ロジックやクォータ計算は維持すること

2. 設定の追加（互換性維持）
   2.1 jobs.yaml 側で上記パラメータを任意に上書きできるようにする（デフォルトは ON）
   2.2 設定が無い既存 jobs.yaml でも動作すること（後方互換は必須）

3. ログ（効果測定）
   3.1 [Collect] 1行ログに、query に加えて printType / langRestrict を必ず表示する
   3.2 Pipeline Summary に「no ISBN 比率」を追加する
       指標例: ISBN hit rate = after_isbn_filter / returned
       代替例: skipped_no_isbn / returned

4. テスト（Gate 1）
   4.1 collector のユニットテストで、リクエストに printType=books と langRestrict=ja が含まれることを検証（外部APIはモック）
   4.2 既存テストがすべて通ること

Scope (Out):
1. startIndex を使ったページネーション導入
2. ISBN-10 許容 / volumeId 保存などのキー戦略変更
3. DB マイグレーション
4. ランキング/推薦ロジックの変更

Non-Functional Requirements:
1. ログに API key 等の秘匿情報を出さない（マスク/出力禁止）
2. ログは grep しやすい 1 行形式を維持し、冗長化しない
3. Doc コメントは日本語

Deliverables:
1. 実装に先立って Claude Code（CLI）が Plan を作成すること（この instruction では実装しない）
2. Plan に必ず含めること
   2.1 変更ファイル一覧（想定）
   2.2 設定追加の仕様（デフォルト/上書き/互換性）
   2.3 ログ出力仕様（前後比較ができる項目）
   2.4 必須テストと Verify コマンド
   2.5 Rollback 方針

Verify (Plan に必須):
1. npm run build
2. npm test
3. dre run-due --force | tee vibe-debug.log
判定観点:
1. 各クエリで skipped(no ISBN) が減る、または after_isbn_filter/returned が改善している
2. max_per_run / mail_limit の挙動が変わっていない

Rollback:
追加したデフォルト検索条件を無効化（設定デフォルトOFFに戻す）または該当コミット revert で切り戻せること。
