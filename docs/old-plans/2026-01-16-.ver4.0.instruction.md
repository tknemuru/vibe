## 事象概要（背景・問題認識）

### 発生した事象
run-due を何度実行しても、メールで通知される書籍内容が常に同じになっていた。
mail reset や --force 実行を行っても挙動が直感的でなく、手動運用のストレスが高かった。

### 表面上の症状
- 毎回同一の書籍が選択・通知される
- 未配信書籍が存在しないはずなのに、同じ候補が繰り返し選ばれる
- --force 実行時に 0 件になる、または同じ集合になるなど挙動が不安定

### 調査で判明した事実
- books.last_delivered_at は全書籍で正しく更新されていた
- DB上の配信履歴自体は存在していた
- しかし Selector は配信履歴（last_delivered_at / deliveries）を参照しておらず、
  ORDER BY + LIMIT による固定順抽出のみを行っていた
- deliveries テーブルは item_hashes_json による集合単位の履歴しか持っておらず、
  「job × isbn13」という書籍単位の配信履歴が存在しなかった

### 根本原因
- 配信履歴の Single Source of Truth（SSOT）が不明確だった
- hash ベースの暫定的な重複排除ロジック（item_hashes_json）が温存され、
  書籍ドメインに適した履歴管理に移行できていなかった
- Selector / run-due の判断理由がログに出ておらず、
  不具合の可視化が困難だった

### この改修で達成したいこと
- 「job × isbn13」の配信履歴を明確にDBで管理し、重複配信を構造的に防ぐ
- hash ベースの暫定ロジックを完全に廃止する
- Selector / run-due / reset の判断理由をログで追えるようにし、
  同様の問題を即座に検知・修正できる状態にする

## 改修目的

- job × isbn13 の配信履歴を正しく管理する
- 既存の hash ベース重複排除を完全に廃止する
- 今後同様の事故を即座に検知できるようログを強化する

---

## 1. item_hashes_json の物理削除（必須）

### 対象
- deliveries.item_hashes_json

### 対応
- カラムを完全に削除する
- 参照しているコード・ロジックはすべて削除する
- 「互換のため残す」「将来用」は一切不要

※ SQLite のため、テーブル再作成による migration を行う

---

## 2. delivery_items を SSOT とする

### delivery_items（新設）
- job_name × isbn13 を UNIQUE
- Selector の未配信判定は必ず delivery_items を参照

```sql
LEFT JOIN delivery_items di
  ON di.job_name = :job
 AND di.isbn13 = b.isbn13
WHERE di.isbn13 IS NULL
