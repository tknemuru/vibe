# 最終版：Execution Plan for AI Tools

## Architecture Overview（確定仕様）

### 目的

自然言語テーマをジョブ化し、3時間ごとに検索して新規を抽出→LLMで要点＋見解（推測明示）→HTMLメール通知→CLIでGood/Bad評価→次回選別に反映する。

### 実行環境

* Windows 11 + WSL2（ローカル）
* 実行は **1回起動型**：`vibe run-due`
* 定期起動は Windowsタスクスケジューラ（例：30分ごとに `run-due`）

### 検索

* **Google Programmable Search JSON API**
* Billingは紐付けない（無料枠超過は失敗で止まる）
* 追加で **日次95クエリでフェイルクローズ**（絶対課金しないため）
* 検索クエリは `(<query>) (site:a OR site:b OR ...)` 形式で allowlist を反映

### LLM

* OpenAI API
* primary: `gpt-5-nano`
* fallback: `gpt-5-mini`（検証失敗時のみ1回）
* 入力：title/snippet/url（HTML本文は取得しない）

### 通知

* Gmail SMTP（HTMLメール）

### フィードバック

* CLI方式2

  * `vibe feedback inbox`（未評価一覧）
  * `vibe feedback good|bad <ID...>`（複数一括）

### 永続化

* SQLite（単一ファイル `data/app.db`）

---

## データ/設定の最終仕様（固定）

### `config/jobs.yaml`（スキーマ）

* `defaults`：

  * `interval: 3h`（MVP固定、他の値は拒否）
  * `limit: 5`
  * `freshness: Week`
  * `allowlist: [note.com, zenn.dev, qiita.com]`
* `jobs[]`：

  * `name: string`（ユニーク）
  * `query: string`
  * `enabled: boolean`
  * 任意で `limit`, `allowlist` を上書き可能（freshnessはMVP固定でもOK）

### `.env`（必須キー）

* Google Search

  * `GCS_API_KEY=...`
  * `GCS_CX=...`
* OpenAI

  * `OPENAI_API_KEY=...`
  * `OPENAI_MODEL_PRIMARY=gpt-5-nano`
  * `OPENAI_MODEL_FALLBACK=gpt-5-mini`
* Gmail SMTP

  * `SMTP_HOST=smtp.gmail.com`
  * `SMTP_PORT=587`
  * `SMTP_USER=...@gmail.com`
  * `SMTP_PASS=...`（アプリパスワード）
  * `MAIL_TO=...`
* App

  * `APP_TZ=Asia/Tokyo`
  * `DAILY_QUERY_LIMIT=95`

---

# Claude Code（CLI）に渡す指示書（最終版）

## Epic

CLIアプリ `vibe` を実装する。ジョブをYAML管理し、`run-due`でdueジョブのみ検索→新規抽出→LLM要約→HTMLメール送信→フィードバックをSQLiteに保存し次回ランキングへ反映する。無料枠厳守のため日次クエリ上限95でフェイルクローズする。

---

## Task 1: リポジトリ雛形（Node.js/TypeScript）＋コマンド骨格

* **Agent**: Claude Code
* **成果物**

  * TSプロジェクト、`vibe` CLIが動く
* **Steps**

  1. Node+TSセットアップ（build/run）
  2. CLIフレーム導入（commander等）でサブコマンド追加できる構造
  3. `.env` ロード（dotenv）
  4. `vibe doctor`（設定診断）コマンド追加
* **DoD**

  * `vibe --help` と `vibe doctor` が動く
* **Verify**

  * WSL2で `npm run build` 成功
* **Risks**

  * 依存過多にならないよう最小構成

---

## Task 2: jobs.yaml 読み込み＋CRUD（CLI）

* **Agent**: Claude Code
* **成果物**

  * `vibe job ls/add/update/rm/enable/disable`
* **Steps**

  1. `config/jobs.yaml` の読み込み・書き戻しユーティリティ
  2. スキーマ検証（intervalは **3hのみ許可**、freshness=Week固定）
  3. CRUD実装（nameの重複防止）
* **DoD**

  * CLIのみでジョブ管理できる
* **Verify**

  * add→ls→disable→enable→update→rm が通る
* **Risks**

  * YAML破損時のエラーメッセージを丁寧に（修復指針も表示）

---

## Task 3: SQLite 永続化（スキーマ作成＋DAO）

* **Agent**: Claude Code
* **成果物**

  * DB初期化（マイグレーション簡易でも可）＋アクセス層
* **テーブル（必須）**

  * `items(item_hash PK, url, title, snippet, domain, first_seen_at, last_seen_at, last_delivered_at NULL, summary_json NULL)`
  * `deliveries(id PK, job_name, delivered_at, item_hashes_json)`
  * `feedback(id PK, item_hash, rating INT, note NULL, created_at)`
  * `job_state(job_name PK, last_success_at NULL, last_run_at NULL)`
  * `api_usage(date PK, provider, count)`（providerは `gcs` 固定でも可）
* **Steps**

  1. DBファイル `data/app.db` 作成
  2. テーブル作成
  3. DAO（upsert item / mark delivered / list undelivered / list feedback / etc）
* **DoD**

  * 重複排除・通知済み管理・未評価抽出が可能
* **Verify**

  * 同一URLが増殖しない（hashで統一）
* **Risks**

  * URL正規化方針を固定（utm除去、末尾スラッシュ等）

---

## Task 4: 日次クォータガード（無料枠厳守・フェイルクローズ）

* **Agent**: Claude Code
* **成果物**

  * `DAILY_QUERY_LIMIT=95` を超えない安全装置
* **Steps**

  1. JST基準で“今日”を算出（APP_TZ）
  2. `api_usage` から今日のcount取得
  3. count >= 95 の場合、検索実行をスキップしログ出力
  4. 成功した検索1回につき count +1
* **DoD**

  * 95で止まり、その日は検索しない
* **Verify**

  * countを95にしてrun-dueが検索しない
* **Risks**

  * 再試行でカウントがズレる→MVPは「成功時のみ加算」でOK

---

## Task 5: Google Programmable Search JSON API Collector

* **Agent**: Claude Code
* **成果物**

  * GCS検索→結果（title/snippet/link）取得→itemsに保存
* **Steps**

  1. `.env` から `GCS_API_KEY` `GCS_CX` 読み込み
  2. allowlist（ドメイン配列）を `site:` OR でクエリに組み込む
  3. 1回の検索でlimit以上の候補を取得（limit=5なら10程度取っても良い）
  4. URL正規化→item_hash生成→itemsへupsert（first/last seen 更新）
* **DoD**

  * 1ジョブで検索→保存まで成功
* **Verify**

  * allowlist変えると結果が変わる
* **Risks**

  * freshness=Weekの厳密指定が難しい場合はDBの `first_seen_at >= now-7d` を優先

---

## Task 6: Ranker v1（差分＋フィードバック反映）

* **Agent**: Claude Code
* **目的**

  * 通知5件を「新規性 + 好み」で選別
* **Steps**

  1. 候補：未配信（last_delivered_atがNULL）を優先
  2. スコア：

     * 新規性（first_seen_atが新しいほど加点）
     * ドメイン：Goodが多いドメイン加点、Badが多いドメイン減点
     * 文言：snippet/title内の単語のGood/Bad傾向（軽量）
  3. 上位limitを採用
* **DoD**

  * Badつけた傾向が次回減る
* **Verify**

  * feedback前後で採用が変化
* **Risks**

  * 極端化→係数に上限、ゼロ割回避

---

## Task 7: OpenAI Summarizer（nano primary + mini fallback）＋検証＋キャッシュ

* **Agent**: Claude Code（配線）※プロンプト文面はCursorで改善
* **成果物**

  * itemごとの要約JSONを生成し `items.summary_json` に保存
* **入力**

  * title, snippet, url, domain
* **出力（JSON固定）**

  * `key_points: string[] (2-4)`
  * `takeaway: string`
  * `opinion: string`（推測は「推測: ...」で明示）
  * `confidence: "high"|"medium"|"low"`
  * `next_actions?: string[] (0-2)`
* **フォールバック条件（いずれかで発動）**

  1. 必須フィールド欠落 or JSONパース失敗
  2. key_points が1以下 or 全体が薄すぎる
  3. opinionが断定口調で推測明示/根拠不足（簡易ルールでOK）
* **Steps**

  1. primaryモデルで生成
  2. validate() で検証
  3. 失敗なら fallbackモデルで1回だけ再生成
  4. 成功したらDBへ保存（同一item_hashは再生成しない）
* **DoD**

  * nanoが外してもminiで救済される
* **Verify**

  * 意図的に壊れた出力を想定したテストでfallbackが動く
* **Risks**

  * コスト増→fallbackは最大1回、頻発するならプロンプト改善

---

## Task 8: HTMLメール通知（Gmail SMTP）

* **Agent**: Claude Code（配線）
* **成果物**

  * HTMLメール送信＋deliveries記録＋itemsにlast_delivered_at更新
* **Steps**

  1. SMTP設定（TLS/587）
  2. ジョブ単位でセクション、カードUIでアイテム表示
  3. 各カードに **評価ID**（item_hashの短縮表示）を埋める
  4. 送信後、deliveries保存 & last_delivered_at更新
* **DoD**

  * Gmailに届く
* **Verify**

  * 主要メールクライアントで最低限崩れない
* **Risks**

  * Gmail制限→docsにアプリパスワード手順を記載

---

## Task 9: Feedback CLI（方式2）

* **Agent**: Claude Code
* **成果物**

  * `vibe feedback inbox`
  * `vibe feedback good|bad <ID...>`
* **Steps**

  1. inbox：last_delivered_atがあり feedback未登録の items を新しい順に表示（ID/タイトル/ドメイン/日時）
  2. good/bad：複数IDを受け取り feedbackへ保存（rating +1/-1）
* **DoD**

  * inboxが減り、rankerに効く
* **Verify**

  * 評価後、inboxから消える
* **Risks**

  * ID入力ミス→存在チェック、候補提示

---

## Task 10: run-due（due判定）とログ/観測性

* **Agent**: Claude Code
* **成果物**

  * `vibe run-due` が dueジョブだけ回して終了
* **Steps**

  1. job_stateの last_success_at を参照し due判定（3h）
  2. dueジョブごとに：

     * quota check
     * search
     * rank
     * summarize
     * email
     * state更新
  3. 失敗時はそのジョブのみ失敗として続行（全停止しない）
  4. ログはファイルにも出す（任意、MVPなら標準出力でも可）
* **DoD**

  * 1回起動で安定して完了する
* **Verify**

  * dueでない時は何もしない
* **Risks**

  * 途中失敗→リトライは最小、まずは可観測性重視

---

## Task 11: docs（セットアップ & Windowsタスクスケジューラ）

* **Agent**: Claude Code
* **成果物**

  * `/docs/setup.md` `/docs/windows-task-scheduler.md`
* **内容**

  * GCS（APIキー/cx取得）※Billing紐付けない
  * Gmailアプリパスワード
  * `.env` 記入
  * `run-due` 手動実行
  * タスクスケジューラ：30分ごと起動コマンド例（WSL呼び出し）
* **DoD**

  * ドキュメントだけで再現できる
* **Verify**

  * 新規マシンでも手順通りに動く想定
* **Risks**

  * GUI手順の差→スクショ不要、要点を簡潔に

---

# 最初のジョブ（あなた指定：Claude バイブコーディング）

`config/jobs.yaml` 初期投入：

```yaml
defaults:
  interval: 3h
  limit: 5
  freshness: Week
  allowlist:
    - note.com
    - zenn.dev
    - qiita.com

jobs:
  - name: claude-vibe-coding
    query: "Claude バイブコーディング"
    enabled: true
```

---

# 完了条件（MVP Definition of Done）

1. `vibe doctor` が必須設定不足を検出し案内できる
2. `vibe run-due` で検索→新規抽出→要約→HTMLメール送信が通る
3. `vibe feedback inbox` で未評価が出る
4. `vibe feedback good/bad <ID>` が保存され、次回の採用に影響する
5. 日次95クエリに達したら検索を止める（フェイルクローズ）
6. Billingを紐付けない前提で運用できるdocsがある

---

# リスク & Trade-offs（残る重要ポイント）

* GCS無料枠超過：アプリ側95停止＋Billingなしで課金回避
* “freshness=Week”厳密性：検索API仕様に依存→DB側のfirstSeenで実質担保
* LLM幻覚：本文を読まない前提で断定抑制（推測ラベル必須）
* ローカル停止：PC停止で止まる→MVPは許容
