Topic: 2026-01-20-fix-search-cond

Status: DONE

Summary:
- Plan で合意した「破壊的変更（後方互換なし）」方針が、設定・型・実装・テストのすべてに一貫して反映されている。
- google_books 設定の必須化、fail-fast バリデーション、collector API の必須引数化により、実行時・型レベル双方で安全性が担保された。
- ログおよび Pipeline Summary により、no ISBN 混入率の可視化と前後比較が可能になっている。

Implementation Checkpoints:
- src/config/jobs.ts における GoogleBooksConfig の必須化と JobsConfigError による検証は、設計レビュー指摘どおり適切。
- collector インターフェース変更（options 必須）は破壊的変更として妥当で、影響範囲も明示されている。
- [Collect] ログに printType / langRestrict が追加され、grep 可能な 1 行ログ要件を満たしている。
- Pipeline Summary の ISBN hit rate 表示は、returned / after_isbn_filter の実測に基づき正しく計算されている。
- 新規ユニットテストは Gate 1 要件を十分にカバーしており、既存テストもすべて通過している。

Verify:
- npm run build ✅
- npm test ✅
- dre run-due --force | tee vibe-debug.log（実行・効果測定済み）
- 判定観点:
  - skipped(no ISBN) / ISBN hit rate がログおよび Summary で確認可能
  - max_per_run / mail_limit の挙動に変更なし

Rollback:
- 破壊的変更のため、Rollback は git revert のみを正式手段とする。
- jobs.yaml は旧形式に戻す必要がある（部分的 Rollback 不可）。

Conclusion:
- DoD はすべて満たされており、本トピックは vdev フロー上 **DONE** と判定する。
- 次の改善（検索条件のさらなるチューニングや指標追加）は、新規 TOPIC として切り出すこと。

