Topic: 2026-01-20-gbooks-add-default

Status: DONE

Summary:
- `dre job add` に google_books（printType / langRestrict）指定機能と安全なデフォルト（books / ja）が実装され、直近の破壊的変更と CLI 運用が完全に整合した。
- CLI 追加・保存仕様・バリデーション・テストのすべてが Plan 通りに実装されており、運用上のエラー再発リスクが解消されている。

Implementation Checkpoints:
- src/commands/job.ts において、google_books が **必ず newJob に含まれる**構造になっており、jobs.yaml 必須スキーマと矛盾しない。
- CLI オプション未指定時のデフォルト適用（books / ja）は定数化されており、将来変更にも耐えられる。
- 成功メッセージで google_books 内容が明示され、ユーザーが CLI 実行結果から状態を即時確認できる。
- jobs.yaml への永続化結果が E2E で確認されており、`dre job ls` が壊れないことを実証している。

Tests & Verify:
- npm run build ✅
- npm test ✅（全 87 tests pass）
- E2E:
  - `dre job add -n smoke -q "AI"` → デフォルト適用確認
  - `dre job add -n smoke2 -q "AI" --print-type books --lang-restrict ja` → 明示指定確認
  - `dre job ls` → エラーなし
  - `dre job rm smoke / smoke2` → クリーンアップ確認
- Gate 1 要件をすべて満たしている。

Rollback:
- 該当コミットを git revert
- 追加テストファイルを削除
- jobs.yaml は git restore または手動編集で復旧

Conclusion:
- 本トピックは Plan / Design Review の合意内容を完全に満たしており、vdev フロー上 **DONE** と判定する。
- google_books 必須化 → CLI デフォルト適用までの一連の破壊的変更が安定状態に到達した。
- 次の改善（google_books の他パラメータ対応や job add の拡張）は新規 TOPIC として切り出し可能。

