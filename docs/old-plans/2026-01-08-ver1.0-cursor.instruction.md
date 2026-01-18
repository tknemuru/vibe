# 最終版：Execution Plan for AI Tools（貼り付け用）

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

# Cursor に渡す指示書（最終版）

## Epic

通知の体験（HTMLメール）と要約品質（プロンプト）を、MVPに必要十分な形で整える。CLIメッセージも使いやすくする。

---

## Task C1: Summarizerプロンプト最適化（推測ガード最優先）

* **目的**

  * nanoでも安定して「要点＋見解（推測明示）」が出る
* **指示**

  * 入力：title/snippet/url/domain
  * 出力：指定JSON（key_points/takeaway/opinion/confidence/next_actions）
  * ルール：

    * 不明は不明
    * 推測は必ず `推測:` プレフィックス
    * 根拠はURLのみ（本文未参照を前提に誇張しない）
    * 具体アクションを1つ入れる（任意）
* **DoD**

  * 5件で手直し不要な出力が多数
* **Verify**

  * 断定が減る、内容が薄すぎない

---

## Task C2: HTMLメールテンプレ（カードUI + コピペしやすい評価ID）

* **目的**

  * ぱっと読めて、IDを評価しやすい
* **指示**

  * ジョブ見出し→カード（タイトル/要点/見解/リンク/ID）
  * IDは強調表示＋コピペしやすい文字列
  * 全体はシンプル、CSS最小
* **DoD**

  * Gmailで崩れず読める
* **Verify**

  * モバイルGmailでも最低限OK

---

## Task C3: CLI UX微調整（help/エラー/一覧）

* **目的**

  * 迷わないCLI
* **指示**

  * `vibe doctor` で不足設定を具体指示
  * `feedback inbox` の表示を見やすく（列揃え等）
  * 失敗時のメッセージに次アクションを書く
* **DoD**

  * 試行錯誤せず運用できる

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
