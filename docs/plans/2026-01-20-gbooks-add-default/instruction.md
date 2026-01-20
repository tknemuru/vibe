Topic: 2026-01-20-gbooks-add-default

## Context
直近の破壊的変更により jobs.yaml の各 Job に google_books 設定が必須になった。
その結果、`dre job add -n ... -q ...` で追加されるジョブには google_books が付かず、
以降の `dre job ls` 等のコマンドが設定バリデーションで失敗する（例: jobs[0].google_books is required）。

運用上、CLI で job を追加・再作成するニーズがあるため、
`dre job add` が google_books を扱えるようにし、未指定時は安全なデフォルトを適用したい。

## Goal
1) `dre job add` で google_books 情報（printType / langRestrict）を指定可能にする。
2) 未指定の場合はデフォルトとして以下を設定する（新規追加時のデフォルト）:
   google_books:
     printType: books
     langRestrict: ja
3) 既存の max_per_run / mail_limit / 重複排除（ISBN-13）などの基本挙動は変えない。
4) 既存の config/jobs.yaml のスキーマ（google_books 必須）方針は維持する（後方互換は不要）。

## Scope (In)
1) CLI: `dre job add` の拡張
   - オプション追加（例）:
     - --print-type <string>  （google_books.printType）
     - --lang-restrict <string>（google_books.langRestrict）
   - オプション未指定時はデフォルト適用:
     - printType=books
     - langRestrict=ja
   - help / usage に反映する（ユーザーが迷わないこと）

2) 永続化: `dre job add` が保存する job 定義に google_books を必ず含める
   - jobs の保存先が config/jobs.yaml である前提で、追加時に google_books を書き込む
   - 既存 job 追加・削除・一覧などのサブコマンド群に影響が出ないようにする

3) バリデーション整合
   - `src/config/jobs.ts` の google_books 必須バリデーションと矛盾しないようにする
   - 追加時点で google_books が常に満たされるため、`dre job ls` 等が壊れない状態を担保する

4) テスト（Gate 1）
   - `dre job add` のユニットテスト（または統合テスト最小）で以下を検証:
     - google_books を明示指定した場合、その値で保存される
     - 未指定の場合、デフォルト（books/ja）で保存される
   - 既存テストがすべて通ること

## Scope (Out)
- Google Books API の検索条件追加・ログ改善（前トピックの範囲）
- startIndex ページネーション導入
- DB マイグレーション
- ランキング/推薦ロジック変更
- jobs.yaml の後方互換（旧形式の読み込み）

## Non-Functional Requirements
- ログに API key 等の秘匿情報を出さない
- 既存コマンド体系との整合を保つ（`dre rm` のような存在しないサブコマンドを増やさない）
- Doc コメントは日本語

## Deliverables
- 実装に先立って Claude Code（CLI）が Plan を作成すること（この instruction では実装しない）
- Plan には以下を必ず含めること：
  - 変更ファイル一覧（想定）
  - `dre job add` の新オプション仕様（名称、デフォルト、help 表示）
  - jobs.yaml への保存仕様（google_books が常に入ること）
  - 必須テストと Verify コマンド
  - Rollback 方針

## Verify (Plan に必須で入れること)
- npm run build
- npm test
- dre job add -n smoke -q "AI"（未指定デフォルトが入ること）
- dre job add -n smoke2 -q "AI" --print-type books --lang-restrict ja（明示指定が入ること）
- dre job ls（エラーにならないこと）

## Rollback
- 追加した CLI オプションとデフォルト適用の変更を revert で切り戻せること
