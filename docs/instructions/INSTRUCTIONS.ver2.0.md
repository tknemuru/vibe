# Execution Plan for AI Tools Ver2.0

## Architecture Overview（採用案）

### 構成と責務

* **CLI（vibe）**：実行入口、設定管理、DB操作コマンド、run-due実行
* **Collector（Books）**：書籍情報を複数ソースから収集（MVPは最低1ソースでもOK）
* **DB（SQLite）**：書籍の正規化（ISBN13主キー）、配信状態（last_delivered_at）、deliveries履歴、job_state、api_usage
* **Mailer（Gmail SMTP）**：書籍カード＋DeepResearchコピペブロックをHTMLメールで送信
* **Selector**：メール掲載対象の選定（未配信優先＋0件回避フォールバック）

### 依存方向

CLI →（Config/Collector/DB/Selector/Mailer）
Collector → DB（upsert）
Selector → DB（抽出）
Mailer → DB（deliveries保存＋last_delivered_at更新）

---

## Options Considered（再掲）

* **既存に追加して旧モードも残す（案①）**：運用負債が増えるので不採用
* **既存に追加しつつ不要部を削除（案②）**：採用（本Plan）
* **新規（案③）**：今回は不採用（土台が流用できるため）

---

## Execution Plan for AI Tools（指示書）

> 既定戦略：**Claude Code（CLI）一本化**
> 例外的に Cursor を使うのは「メールHTML/コピペ用ブロックの文面・整形」など短い反復が必要な箇所のみ。

### Epic

既存 `vibe` を「書籍収集＋DeepResearch支援メール」へ刷新し、

* **(1) db reset（全消し）**
* **(2) mail reset（配信状態だけ戻す）**
  を追加して “繰り返し実行しやすい運用” を完成させる。

---

### Task 1：ブランチ作成＋旧機能の凍結（削除は後回し）

* **Agent**：Claude Code
* **目的/成果物**

  * 変更の着地点を見失わないよう、旧パイプライン（search/rank/summarize/feedback）を「未参照化」してから置き換える
* **変更範囲**

  * CLIの run-due 実行パス、依存の配線
* **Steps**

  1. 旧run-dueの処理段（quota→search→rank→summarize→email→state更新）を把握
  2. 「search/rank/summarize/feedback」を呼ばない新実行パスを追加（後続タスクで中身を実装）
  3. 旧コマンドは一旦残しつつ、helpから隠す/非推奨表示でもOK
* **DoD**

  * `vibe run-due` が新パスに入れる（中身がstubでも良い）
* **Verify**

  * `npm run build`
  * `vibe --help` / `vibe run-due --help`
* **Rollback**

  * ブランチ/タグで即戻せる
* **Risks**

  * 先に大量削除すると差分が追えない → “未参照化→置換→最後に削除”

---

### Task 2：Configスキーマ更新（鮮度ロジックの簡素化）

* **Agent**：Claude Code
* **目的/成果物**

  * `jobs.yaml` 固定制約（interval=3hのみ許可、freshness=Week固定）を撤廃し、書籍用の設定へ
* **変更範囲**

  * `config/jobs.yaml` 読み込み/検証/CRUD
* **Steps**

  1. `freshness` を廃止（受け取っても無視 or バリデーションから除外）
  2. `interval` の「3h固定、他拒否」を撤廃（任意のduration許可）
  3. `limit` を “メール掲載数” と “収集上限（max_per_run）” に分離
  4. （任意）Bucket（棚）定義を追加（最初はシンプルに `queries: string[]` 程度）
* **DoD**

  * 既存の job CRUD が壊れず、新フィールドで動く
* **Verify**

  * `vibe job add/update/ls` 一連が通る
* **Rollback**

  * configのバックアップ（`config/jobs.yaml.bak`）
* **Risks**

  * 設定移行で詰まる → 起動時に移行ガイドを出す

---

### Task 3：SQLiteスキーマ刷新（items→books へ）

* **Agent**：Claude Code
* **目的/成果物**

  * `items`中心のモデルから `books`（isbn13主キー）へ移行。deliveries/job_state/api_usage は流用
* **変更範囲**

  * DB初期化、DAO
* **Steps**

  1. 新テーブル `books` を追加（`isbn13 PK`, `title`, `authors_json`, `publisher`, `published_date`, `description`, `cover_url`, `links_json`, `first_seen_at`, `last_seen_at`, `last_delivered_at NULL`）
  2. `deliveries` は `isbn13_list_json` に変更（または新deliveries_booksを作ってもOK）
  3. 旧 `feedback` は今回不要なので新規には作らない
  4. DAO：`upsertBook`, `listUndeliveredBooks`, `markDelivered(isbn13[])`, `resetDelivered(since?, job?)`, `resetDb(backup)` を用意
* **DoD**

  * “重複しない（isbn13で収束）” と “配信済み管理（last_delivered_at）” が成立
* **Verify**

  * 同じisbn13を複数回upsertしても1行に収束（ユニットテスト）
* **Rollback**

  * 旧DBを `data/app.db.bak` に退避してから移行/作り直し
* **Risks**

  * 既存DB利用者がいる場合は破壊的 → `vibe db reset` で明示的に作り直せるようにする

---

### Task 4：Collector（書籍収集）実装（MVP: 1ソースでもOK）

* **Agent**：Claude Code
* **目的/成果物**

  * クエリ/Bucketから書籍候補を収集して `books` にupsert
* **変更範囲**

  * `src/collectors/`（新設）、HTTP、quota連携
* **Steps**

  1. 収集のI/Fを定義：`collect(job) -> Book[]`
  2. `max_per_run` まで取得（鮮度制約なし）
  3. isbn13がない候補は除外（ログに残す）
  4. `api_usage` のカウント（provider=books等）を更新（既存クォータガード流用）
* **DoD**

  * 1ジョブで「収集→DB反映」まで通る（※書籍版に読み替え）
* **Verify**

  * `vibe run-due --force-mail` でDBにbooksが増える
* **Rollback**

  * collectorをfeature flagで無効化できる
* **Risks**

  * 外部APIの変動 → エラー時はジョブ単位で失敗に留める（前回run-due方針踏襲）

---

### Task 5：Selector（掲載対象）＋0件回避フォールバック

* **Agent**：Claude Code
* **目的/成果物**

  * 「未配信優先＋空メール回避」を実現
* **変更範囲**

  * DBクエリ、run-dueのメール前処理
* **Steps**

  1. 基本：`last_delivered_at IS NULL` を新しい順に mail_limit 件
  2. フォールバック：未配信が0なら `last_seen_at` の新しい順に K件（既配信含む）
* **DoD**

  * 何度回しても “0件メール” が起きにくい
* **Verify**

  * DBに未配信0の状態で実行してもメールにK件載る（統合テスト or 手動手順）
* **Rollback**

  * フォールバックを設定でOFFにできる
* **Risks**

  * 既配信の再掲が増えすぎる → Kを小さく/日数制限オプション

---

### Task 6：Mailer刷新（DeepResearchコピペブロックを本文に埋め込む）

* **Agent**：Cursor（例外）
* **Cursorを使う理由**

  * HTMLメールの見た目・コピペしやすさは短い反復調整が多い
* **Cursorでやる範囲**

  * メールテンプレ（HTML）と「書籍カード」部品
* **Claude Codeに残す範囲**

  * テンプレへ渡すデータ構造、送信・deliveries記録、last_delivered_at更新
* **テンプレ仕様（確定）**

  * 各書籍に以下を必ず表示：

    * 【書籍情報】（タイトル/著者/出版社/出版年/ISBN/説明）
    * 【参考リンク】（links_json）
    * 【DeepResearchプロンプト】＝ **「要約レポートを作成してくれ。」**（固定の一文＋情報ブロック）
* **DoD**

  * メールからそのままコピペしてDeepResearchに投げられる
* **Verify**

  * Gmail/主要クライアントで最低限崩れない
* **Rollback**

  * 旧テンプレを `templates/legacy/` に残す
* **Risks**

  * 等幅ブロックが環境で崩れる → プレーンテキストも併記するオプションを検討

---

### Task 7：コマンド追加（案1/案2：db reset / mail reset）

* **Agent**：Claude Code
* **目的/成果物**

  * 破壊的操作を安全に提供し、繰り返し運用のストレスを解消
* **変更範囲**

  * CLIサブコマンド、DAO
* **コマンド仕様**

  1. `vibe db reset [--yes]`

     * `data/app.db` をバックアップして作り直し（全クリア）
  2. `vibe mail reset [--job <name>] [--since <duration>] [--yes]`

     * `books.last_delivered_at = NULL` に戻す（配信状態のみクリア）
* **DoD**

  * “重複は増えないが、再送可能” の運用ができる
* **Verify**

  * mail reset後に selector の未配信候補が復活する
* **Rollback**

  * db resetは必ずbakを残す（復元手順をdocsへ）
* **Risks**

  * 誤操作 → `--yes` 必須 or 対話確認を必須にする

---

### Task 8：不要機能の物理削除（最後に）

* **Agent**：Claude Code
* **対象**

  * GCS検索、Ranker、Summarizer、Feedback CLI、feedbackテーブル作成など
* **DoD**

  * リポジトリに今回仕様と無関係なコードが残っていない
* **Verify**

  * `npm run build` / `npm test`
* **Rollback**

  * 削除前のタグへ戻せる
* **Risks**

  * “まだ参照が残ってた” を防ぐために、Task 1で先に未参照化

---

### Task 9：Docs刷新（setup / ops / rollback）

* **Agent**：Claude Code
* **成果物**

  * `docs/setup.md`：APIキー、SMTP、初回実行
  * `docs/ops.md`：run-due運用、mail reset/db resetの使い分け
  * `docs/rollback.md`：bakからの復元手順
  * （必要なら）`docs/windows-task-scheduler.md`（前回踏襲）
* **DoD**

  * ドキュメントだけで再現できる
* **Verify**

  * 新規環境想定の手順レビュー

---

## Quality Gates（必須）

### テスト方針

* **テストする（必須）**

  * ISBN正規化（もし入れるなら）
  * upsert重複排除（isbn13）
  * selector（未配信優先＋フォールバック）
  * `mail reset` の対象範囲（since/jobフィルタ）
  * `db reset` のバックアップ作成
* **テストしない（MVP）**

  * 外部APIのE2E（モック/スタブで境界テスト）

### 最小テストセット

* `upsertBook` が同一isbn13で増殖しない
* `listUndeliveredBooks` が `last_delivered_at NULL` のみ返す
* `resetDelivered` 後に未配信が復活する
* 0件時フォールバックがK件返す

### Docコメント必須範囲

* 型：`Book`, `JobConfig`, `Delivery`
* 関数：collector、selector、reset系コマンド

### Task完了時の自己点検（実装AIに報告させる）

* 変更ファイル一覧
* Verify結果（コマンドと要約）
* DoD根拠
* 残課題

---

## Risk & Trade-offs

* **外部API変動**：collectorは失敗してもジョブ単位で落とす（run-dueの“全停止しない”方針を継承）
* **破壊コマンド誤操作**：`--yes`/対話確認とバックアップで保護
* **0件メール問題の再発**：selectorフォールバック＋mail resetで回避
