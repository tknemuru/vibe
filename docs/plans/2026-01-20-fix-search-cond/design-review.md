Topic: 2026-01-20-fix-search-cond

Status: DESIGN_APPROVED

Summary:
- 破壊的変更（後方互換なし）の方針が Plan 全体に一貫して反映され、設計が大幅に単純化された。
- google_books 設定の必須化・fail-fast バリデーション・責務分離（config → collector）が明確で、Claude Code が迷わず実装できる内容になっている。
- ログ／Pipeline Summary／テスト／Rollback の各要件が vdev Gate 1 の観点で十分に具体化されている。

Design Checkpoints:
- jobs.yaml に google_books を必須化し、TypeScript 型 + 実行時バリデーションの両面で担保している点は適切。
- collector の options を必須引数にした判断は、破壊的変更方針と整合しており良い。
- Pipeline Summary の指標追加が「returned / after_isbn_filter」の定義付きで明示されている点は評価できる。
- Rollback を git revert に限定している点も、破壊的変更として妥当。

Minor Notes (任意・実装時判断):
- [Collect] ログの `skipped=5 (no ISBN)` は、実装時に `skipped_no_isbn=5` のキー形式に寄せると将来拡張にさらに強くなる。
- ISBN hit rate の表示フォーマット（小数1桁など）は run-due.ts 実装時に一箇所で定数化するとよい。

Verify:
- npm run build
- npm test
- dre run-due --force | tee vibe-debug.log
- 判定観点:
  - skipped(no ISBN) の低下、または ISBN hit rate の改善
  - max_per_run / mail_limit の挙動が変わっていないこと

Rollback:
- 該当コミットを git revert
- jobs.yaml を旧形式に戻す（破壊的変更のため部分 rollback 不可）

Next Action:
- DESIGN_APPROVED のため `vdev start 2026-01-20-fix-search-cond` に進行可能。
- 以降は Plan から逸脱せず、impl → impl-review の順で vdev フローを継続すること。

