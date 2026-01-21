Status: DONE

# 総評
実装内容は plan の要求（ページング、カーソル永続化、枯渇時 warn+停止の維持、エラー/クォータ/上限停止の誤枯渇防止、job単位リセット、hash正規化と短縮表示、overfetch防止、UPSERTでlast_updated_at更新保証）を満たしており、ビルド成功・全テストパスの根拠も提示されています。

# 主要確認ポイント（plan整合）
- collect_cursor 新設（複合PK、start_index/is_exhausted/last_updated_at）: 実装済み
- query_set_hash: trim+空白正規化+sort、lowercase無し、DBはフル長、ログは短縮: 実装済み（hash.ts + test）
- overfetch 防止: `min(API_MAX_RESULTS, remaining)` : 実装済み
- 枯渇停止の誤判定防止: apiSuccess 必須 + stopReason 排他: 実装済み
- 枯渇時スキップ（次回も停止維持）: run-due で is_exhausted を見てスキップ: 実装済み
- 手動リセット: `dre job cursor reset <job-name> --yes`、--yes必須: 実装済み + test
- last_updated_at: ON CONFLICT DO UPDATE で更新保証: 実装済み（秒精度に合わせたテスト調整も妥当）

# 差分/注意（Non-blocking）
- plan では `docs/ops/collect.md` 新規だったが、実装では `docs/ops.md` に追記としている。運用ドキュメントの置き場所として一貫していて、内容が入っているなら問題なし（ただし repo 既存のドキュメント構造に沿っていることは最終的に確認推奨）。
- last_updated_at のテストは秒精度依存のため待機を入れている。現状 1100ms は妥当だが、もし将来CIの遅延等で不安定化する場合は（次の改善として）SQL側でより高精度な時刻関数を使えるか検討余地あり。

# 結論
実装は完了条件を満たしているため DONE。
