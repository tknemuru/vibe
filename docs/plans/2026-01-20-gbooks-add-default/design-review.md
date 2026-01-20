Topic: 2026-01-20-gbooks-add-default

Status: DESIGN_APPROVED

Summary:
- `dre job add` で google_books を必ず付与し、未指定時に books/ja をデフォルト適用する設計は、直近の「google_books 必須スキーマ」と整合しており、運用復旧の目的に直結している。
- CLI オプション仕様、保存される jobs.yaml 形、Verify（E2E）まで具体化されており、Claude Code が迷わず実装できる。
- テスト方針（ユニット + E2E）も Gate 1 と整合している。

Requests:
- なし（実装に進行可）

Minor Notes (任意・実装時判断):
- 成功メッセージに google_books を出すのは良いが、ログが冗長にならないよう 1 行で収める（例: `google_books=printType:books,langRestrict:ja`）。
- ユニットテストで I/O を避ける場合、「newJob に google_books が入っていること」＋「保存関数に渡される payload に google_books が含まれること」まで検証できる形（保存層をモックして引数検査）にすると、E2E に依存しすぎず堅い。
- `--queries`（comma-separated）と `-q`（複数回指定）など既存の query 取り回しがある場合、newJob 構築前の `queries` 正規化が既存のまま壊れないことを確認する。

Verify:
- npm run build
- npm test
- dre job add -n smoke -q "AI"
- dre job add -n smoke2 -q "AI" --print-type books --lang-restrict ja
- dre job ls
- dre job rm smoke
- dre job rm smoke2

Rollback:
- 該当コミットを git revert
- 追加したテストファイルを削除
- jobs.yaml は必要に応じて git restore / 手動編集で追加分を除去

