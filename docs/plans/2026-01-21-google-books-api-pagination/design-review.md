Status: DESIGN_APPROVED

# 総評
前回の Must 指摘（last_updated_at の更新保証、items空の誤枯渇防止、端ケース明記、CLI体系の整合、overfetch防止、hash正規化方針、startIndex保存ルール）が plan に反映され、実装時のブレや運用事故リスクが十分に低減されています。
「枯渇時は warn + 停止」「エラー/クォータ/上限停止は枯渇扱いしない」「job単位リセットで復帰」「jobs.yaml手動編集を増やさない（hashは計算のみ）」の要件が、設計とテストに落ちている点を確認しました。

# 承認理由（要点）
- collect_cursor の責務が明確で、テーブル追加も1つに限定されている
- UPSERT で INSERT/UPDATE 両方の last_updated_at 更新が担保されている
- stopReason と is_exhausted の排他性・判定順序が明文化され、items.length==0 を “成功枯渇” に限定して扱える
- overfetch 防止（min(40, remaining)）が設計・テスト要件に含まれている
- リセット手段が job 配下に収まり、運用コマンドとして安全（--yes必須）である
- 端ケース（totalItems=0、totalItems未取得）を含めた挙動が定義されている

# 実装時の注意（Non-blocking）
- stopReason は永続化しない方針なので、ログ出力で十分に観測できるように（hash短縮、startIndex/totalItems、停止理由）を徹底すること
- DAO が返す型（snake/camel）に実装が揺れないよう、run-due 側の参照名と dao.ts の返却形を一致させること（planの意図どおりでOK）

次工程: DESIGN_APPROVED なので実装（impl）に進めます。
