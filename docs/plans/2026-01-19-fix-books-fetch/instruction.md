---

# vdev instruction: Google Books 取得件数が少ない問題の切り分けと改善

## 背景

* 書籍収集アプリにおいて、取得・蓄積される書籍件数が直観より少ない。
* Google Books API の仕様（maxResults / ページネーション / totalItems）による制約なのか、
  アプリ実装（取得・Upsert・Select・Mail）の不具合なのかを切り分けたい。
* setup.md / ops.md に記載の運用・制約（`max_per_run`, `DAILY_BOOKS_API_LIMIT`, mail制限）を前提とする。

## 目的（この instruction のゴール）

1. **「どの段階で件数が減っているか」をログだけで判別できる状態にする**
2. Google Books API の仕様に沿って、必要であれば **ページネーション取得を正しく実装**する
3. Upsert（ISBN-13重複排除）による減少が「正常か／改善対象か」を判断できる材料を揃える
4. その結果を ops/setup ドキュメントに反映できる状態にする

## Claude Code に求めるアウトプット（重要）

* **まず Plan を作成すること（実装はしない）**
* Plan では以下を必ず含めること：

  * Collect → Upsert → Select/Mail の各段階での「件数観測ポイント」
  * Google Books API 呼び出し仕様の確認事項
    （`maxResults` デフォルト10、最大40、`startIndex` によるページネーション）
  * ページネーション導入時の取得上限設計（`max_per_run` との整合）
  * Upsert 内訳（insert / existing / no-isbn13 など）の可視化方針
  * 必須テスト（ページネーション／Upsert内訳）の方針
  * docs（setup / ops / rollback）更新方針

## 制約・注意点

* 実装エージェントは **Claude Code（CLI）を前提**とする（横断的変更のため）
* APIキー等の秘匿情報はログ出力時に必ずマスクすること
* 外部API依存部分はテストではモック前提とする
* Docコメントは **日本語**で記載すること
* 「件数が少ないが正常」という結論もあり得るため、**改善ありきで進めない**

## 成功条件（DoD の判断基準）

* ログを見るだけで、以下が判別できる設計になっていること：

  * APIが返していないのか
  * ページネーション不足なのか
  * Upsertの重複排除で減っているのか
  * Mail/Select上限で「少なく見えている」だけなのか
* ページネーションが必要な場合、その設計が `max_per_run` / 日次上限と矛盾しない
* 上記内容を含んだ **実装可能な Plan** が提示されていること

---
