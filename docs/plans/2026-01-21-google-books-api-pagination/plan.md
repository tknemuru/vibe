# 実装計画: Google Books API ページング対応

## 概要

Google Books API からの書籍取得処理にページング機能を追加し、取得進捗（カーソル）を永続化する。
枯渇時は停止状態を記録し、手動リセットで再開可能にする。

**テーブル追加方針**: 制御状態は `collect_cursor` テーブルに集約し、他テーブルは増やさない。

---

## 1. アーキテクチャ概要

### 1.1 状態管理の新規テーブル

`collect_cursor` テーブルを追加してカーソル/枯渇状態を永続化する。

```sql
CREATE TABLE collect_cursor (
  job_name TEXT NOT NULL,
  query_set_hash TEXT NOT NULL,
  start_index INTEGER NOT NULL DEFAULT 0,
  is_exhausted INTEGER NOT NULL DEFAULT 0,  -- SQLite では BOOLEAN は INTEGER (0/1)
  last_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (job_name, query_set_hash)
);
```

- **job_name**: ジョブ識別子
- **query_set_hash**: クエリ集合のSHA-256ハッシュ（フル64文字、変更検知用）
- **start_index**: 次回取得開始位置
- **is_exhausted**: 枯渇フラグ（1=停止中）。DAO では boolean として扱う
- **last_updated_at**: 最終更新日時（NOT NULL + DEFAULT で書き忘れ防止）

### 1.2 query_set_hash の計算

```typescript
// クエリ配列を正規化してハッシュ化
function computeQuerySetHash(queries: string[]): string {
  const normalized = queries
    .map(q => q.trim().replace(/\s+/g, ' '))  // trim + 連続空白を単一スペースに正規化
    .sort()
    .join('\n');
  return crypto.createHash('sha256').update(normalized).digest('hex');  // フル64文字
}
```

**正規化方針（レビュー指摘対応）**:
- **trim**: 前後の空白を除去
- **連続空白の正規化**: `\s+` を単一スペースに置換
- **ソート**: クエリ順序に依存しない
- **lowercase は行わない**: Google Books API のクエリ解釈に影響を与える可能性があるため除外

**ハッシュ長（レビュー指摘対応）**:
- DB キーにはフルの SHA-256（64文字）を保存
- ログ出力時のみ短縮表示（先頭16文字）を使用

```typescript
// ログ用の短縮表示
function shortHash(hash: string): string {
  return hash.slice(0, 16);
}
```

---

## 2. 変更対象ファイル

| ファイル | 変更種別 | 変更内容 |
|---------|---------|---------|
| `src/db/init.ts` | 変更 | `collect_cursor` テーブル追加 |
| `src/db/dao.ts` | 変更 | カーソル CRUD 関数追加 |
| `src/utils/hash.ts` | 新規 | query_set_hash 計算ユーティリティ |
| `src/collectors/google-books.ts` | 変更 | ページングロジック追加 |
| `src/commands/run-due.ts` | 変更 | カーソル読み書きの統合 |
| `src/commands/job.ts` | 変更 | `dre job cursor reset` サブコマンド追加 |
| `src/cli.ts` | 変更なし | job コマンドは既存登録済み |
| `test/collectors/google-books.test.ts` | 変更 | ページングテスト追加 |
| `test/db/dao.test.ts` | 変更 | カーソル DAO テスト追加 |
| `test/commands/job-cursor-reset.test.ts` | 新規 | リセットコマンドテスト |
| `docs/ops/collect.md` | 新規 | 運用ドキュメント |

---

## 3. 実装ステップ

### Step 1: DB スキーマ拡張

**ファイル**: `src/db/init.ts`

1. `collect_cursor` テーブルの CREATE 文を追加
2. マイグレーション対応（既存DBへの ALTER 不要、CREATE IF NOT EXISTS）

### Step 2: DAO 層拡張

**ファイル**: `src/db/dao.ts`

以下の関数を追加:

```typescript
// 型定義（DAO では boolean として扱う）
interface CollectCursor {
  job_name: string;
  query_set_hash: string;
  start_index: number;
  is_exhausted: boolean;  // DB は INTEGER だが DAO では boolean
  last_updated_at: string;
}

// カーソル取得
export function getCollectCursor(jobName: string, querySetHash: string): CollectCursor | undefined

// カーソル更新（UPSERT）- last_updated_at は SQL 側で自動更新
export function upsertCollectCursor(
  jobName: string,
  querySetHash: string,
  startIndex: number,
  isExhausted: boolean
): void

// カーソルリセット（job 単位で全 hash のレコードを削除）
export function resetCollectCursorsByJob(jobName: string): number

// カーソル一覧（内部デバッグ用、CLI には expose しない）
export function listCollectCursors(jobName?: string): CollectCursor[]
```

**DAO での boolean 変換**:
- 読み取り時: `is_exhausted === 1` → `true`
- 書き込み時: `isExhausted ? 1 : 0`

**last_updated_at の更新保証（レビュー指摘対応）**:

UPSERT の SQL で INSERT/UPDATE どちらでも `last_updated_at` を必ず更新する:

```sql
INSERT INTO collect_cursor (job_name, query_set_hash, start_index, is_exhausted, last_updated_at)
VALUES (?, ?, ?, ?, datetime('now'))
ON CONFLICT(job_name, query_set_hash) DO UPDATE SET
  start_index = excluded.start_index,
  is_exhausted = excluded.is_exhausted,
  last_updated_at = datetime('now')
```

これにより DEFAULT は INSERT 時のみ効く問題を回避し、UPDATE 時も必ず更新される。

**リセット操作の明確化（レビュー指摘対応）**:

`resetCollectCursorsByJob(jobName)` は対象 job の全 query_set_hash に紐づくレコードを **削除** する（0 に戻すのではなく DELETE）。
これにより次回実行時は「レコードなし = 新規」として start_index=0 から開始される。

### Step 3: query_set_hash 計算ユーティリティ

**ファイル**: `src/utils/hash.ts`（新規）

```typescript
import crypto from 'crypto';

export function computeQuerySetHash(queries: string[]): string {
  const normalized = queries
    .map(q => q.trim().replace(/\s+/g, ' '))
    .sort()
    .join('\n');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export function shortHash(hash: string): string {
  return hash.slice(0, 16);
}
```

### Step 4: Collector ページング対応

**ファイル**: `src/collectors/google-books.ts`

#### 4.1 インターフェース拡張

```typescript
// 既存の CollectorResult に追加情報
interface CollectorResult {
  // ...existing fields
  cursorState: {
    startIndex: number;      // 次回開始位置
    isExhausted: boolean;    // 枯渇フラグ
    stopReason: 'quota' | 'max_per_run' | 'exhausted' | 'error' | null;
  };
}
```

**型変更の影響範囲**:
- `src/commands/run-due.ts`: cursorState を読み取る（今回の変更で対応）
- 既存の呼び出し元は cursorState を使用しなければコンパイルエラーにならない
- テストファイルで CollectorResult をモックしている箇所は cursorState 追加が必要

#### 4.2 collect() メソッド変更

```typescript
async collect(
  queries: string[],
  maxPerRun: number,
  options: GoogleBooksConfig,
  cursor?: { startIndex: number; isExhausted: boolean }  // 追加
): Promise<CollectorResult>
```

**ページング処理フロー**:

1. カーソルから `startIndex` を取得（なければ 0）
2. `isExhausted === true` なら即 warn + 空結果で return
3. ループ:
   - **maxResults 計算（overfetch 防止）**: `min(40, maxPerRun - collectedCount)`
   - API 呼び出し（startIndex, maxResults）
   - **エラー/クォータ判定（枯渇より先に判定）**
   - 結果を累積
   - 枯渇判定（後述）
   - 上限判定: `累積件数 >= maxPerRun` または `API クォータ残なし`
   - startIndex 更新（後述）
   - 上限到達 → ループ終了（枯渇ではない）
   - 枯渇 → isExhausted = true、warn ログ
4. cursorState を返却

#### 4.3 maxResults の overfetch 防止（レビュー指摘対応）

```typescript
// 各リクエストで要求する件数
const remaining = maxPerRun - collectedCount;
const maxResults = Math.min(40, remaining);  // API 上限 40 と残り件数の小さい方
```

**テスト要件追加**: maxPerRun < 40 のとき overfetch しないことを確認

#### 4.4 枯渇判定とカーソル更新の整合（レビュー指摘対応）

**stopReason と枯渇判定の排他性（レビュー指摘対応）**:

`is_exhausted = true` を設定するのは **stopReason === 'exhausted' の場合のみ**。
他の stopReason（quota / max_per_run / error）では `is_exhausted = false` のままカーソルを保存する。

**判定順序**:
1. API 呼び出し
2. **エラー判定**: 呼び出し失敗 → stopReason = 'error', is_exhausted = false
3. **クォータ判定**: クォータ切れ → stopReason = 'quota', is_exhausted = false
4. **上限判定**: collectedCount >= maxPerRun → stopReason = 'max_per_run', is_exhausted = false
5. **枯渇判定**: 上記いずれでもなく、かつ以下の条件を満たす場合のみ
   - API 呼び出しが成功し totalItems が取得できた
   - `items.length === 0` または `startIndex + items.length >= totalItems`
   - → stopReason = 'exhausted', is_exhausted = true

**枯渇判定ロジック（成功レスポンス前提）**:
```typescript
function checkExhaustion(
  apiSuccess: boolean,
  totalItems: number | undefined,
  startIndex: number,
  itemsLength: number
): boolean {
  // API 失敗または totalItems 取得不能なら枯渇ではない
  if (!apiSuccess || totalItems === undefined) {
    return false;
  }
  // items が空、または全件取得済み
  return itemsLength === 0 || (startIndex + itemsLength >= totalItems);
}
```

**startIndex 更新ルール**:
- **正常取得時（items.length > 0）**: `startIndex += items.length`（次回開始位置）
- **items.length === 0 かつ枯渇の場合**: startIndex は更新しない（据え置き）、is_exhausted = true
- **items.length === 0 かつエラー/クォータの場合**: startIndex は更新しない（据え置き）、is_exhausted = false
- **totalItems 到達の場合**: `startIndex = startIndex + items.length`（= totalItems）、is_exhausted = true

**端ケース: totalItems = 0（レビュー指摘対応）**:
- 最初から結果がない場合（totalItems = 0）
- start_index = 0 のまま、is_exhausted = true として保存
- 「最初から枯渇」として正しく扱われる

**DB へ保存する値**:
- `start_index`: 次回開始位置（枯渇時は最終位置を保存）
- `is_exhausted`: 枯渇フラグ（stopReason === 'exhausted' の場合のみ true）

**totalItems 変動への対応**:
- totalItems は API レスポンスごとに変わりうる（新刊追加等）
- 枯渇判定は「その時点の totalItems」に基づく
- 枯渇後に totalItems が増えた場合、手動リセットで再開可能
- 無限ループ防止: items.length === 0 かつ API 成功なら必ず枯渇として停止

#### 4.5 ログ出力

ページング中のログ:
```
[google-books][job-name] Page 1: startIndex=0, returned=40, totalItems=150
[google-books][job-name] Page 2: startIndex=40, returned=40, totalItems=150
[google-books][job-name] Stopped: max_per_run reached (80/80), next startIndex=80
```

枯渇時のログ（hash は短縮表示）:
```
[WARN][google-books][job-name] Exhausted: startIndex=120 >= totalItems=120 (query_set_hash=abc123def456...)
```

エラー/クォータ時のログ:
```
[google-books][job-name] Stopped: quota limit reached, next startIndex=40
[google-books][job-name] Stopped: API error, preserving startIndex=40
```

### Step 5: run-due コマンド統合

**ファイル**: `src/commands/run-due.ts`

1. Collect 前にカーソル読み取り
2. Collect 後にカーソル保存
3. 枯渇時は warn ログ + 次回もスキップされる状態を維持

```typescript
import { computeQuerySetHash, shortHash } from '../utils/hash';
import { getCollectCursor, upsertCollectCursor } from '../db/dao';

// Collect フェーズ
const querySetHash = computeQuerySetHash(queries);
const cursor = getCollectCursor(job.name, querySetHash);

if (cursor?.is_exhausted) {
  console.warn(`[${job.name}] Skipped: exhausted (query_set_hash=${shortHash(querySetHash)})`);
  continue;
}

const result = await collector.collect(queries, maxPerRun, job.google_books, {
  startIndex: cursor?.start_index ?? 0,
  isExhausted: false
});

// カーソル保存（stopReason に関わらず常に保存）
upsertCollectCursor(
  job.name,
  querySetHash,
  result.cursorState.startIndex,
  result.cursorState.isExhausted
);
```

### Step 6: 手動リセットコマンド（レビュー指摘対応：job 配下に配置）

**ファイル**: `src/commands/job.ts`（既存ファイルに追加）

既存の CLI 体系との整合性を考慮し、`dre collect reset` ではなく `dre job cursor reset` として job コマンド配下に配置する。

**理由**:
- 既存コマンド: `dre job ls/add/update/enable/disable/rm/show`
- カーソルは job に紐づく状態であり、job サブコマンドとして配置するのが自然
- `dre mail reset` も存在するが、これはメール配信履歴のリセットであり責務が異なる

```bash
dre job cursor reset <job-name> --yes
```

- `<job-name>`: 対象ジョブ（必須）
- `--yes`: 確認スキップフラグ（必須、安全のため）

**実装**:
```typescript
// src/commands/job.ts に追加

const cursorCommand = new Command('cursor')
  .description('カーソル関連操作');

cursorCommand
  .command('reset <job-name>')
  .description('指定ジョブのカーソル/枯渇状態をリセット')
  .requiredOption('--yes', '確認フラグ（必須）')
  .action((jobName, opts) => {
    const count = resetCollectCursorsByJob(jobName);
    console.log(`Reset ${count} cursor(s) for job: ${jobName}`);
  });

jobCommand.addCommand(cursorCommand);
```

### Step 7: テスト追加

#### 7.1 DAO テスト (`test/db/dao.test.ts`)

- `getCollectCursor()`: 存在/不在ケース
- `upsertCollectCursor()`: 新規作成/更新、boolean 変換確認
- **`upsertCollectCursor()`: INSERT/UPDATE 両方で last_updated_at が更新されること**
- `resetCollectCursorsByJob()`: 削除件数確認、削除後にレコードが存在しないこと

#### 7.2 Collector テスト (`test/collectors/google-books.test.ts`)

- ページングで複数回 API 呼び出し
- startIndex が正しく進む
- **overfetch 防止**: maxPerRun=10 のとき maxResults=10 で要求（40 ではない）
- 枯渇判定（items 空、totalItems 到達）
- max_per_run で停止（枯渇ではない、is_exhausted=false）
- クォータ制限で停止（枯渇ではない、is_exhausted=false）
- **API エラー時は is_exhausted=false のままカーソル保存**
- **items.length=0 時の startIndex 据え置き確認**
- **totalItems=0 の端ケース（最初から枯渇）**

#### 7.3 統合テスト (`test/integration/run-due.test.ts`)

- カーソルが永続化され次回継続
- query 変更で hash が変わり新規カーソル
- 枯渇後は skip される
- リセット後に再開できる
- **エラー/クォータ停止後は枯渇扱いにならず次回再開できる**

#### 7.4 コマンドテスト (`test/commands/job-cursor-reset.test.ts`)

- `--yes` なしでエラー
- 正常リセット

### Step 8: ドキュメント追記

**ファイル**: `docs/ops/collect.md`（新規）

```markdown
# Collect 運用ガイド

## カーソル永続化

Google Books API からの取得位置（startIndex）は `collect_cursor` テーブルに保存されます。
次回実行時は前回の続きから取得を再開します。

## 枯渇（Exhausted）状態

検索結果を全て取得し終えると「枯渇」状態になります。
枯渇状態のジョブは以後の Collect がスキップされます。

**注意**: API エラーやクォータ制限による停止は「枯渇」ではありません。
これらの場合、次回実行時に自動的に再開されます。

### 枯渇の確認

ログに以下のような警告が出力されます:
```
[WARN][google-books][job-name] Exhausted: startIndex=120 >= totalItems=120
```

### 手動リセット

枯渇状態をリセットして再取得を開始するには:

```bash
dre job cursor reset <job-name> --yes
```

- `<job-name>`: リセット対象のジョブ名
- `--yes`: 必須の確認フラグ

例:
```bash
dre job cursor reset consultant-books --yes
```

## query_set_hash

クエリ集合のハッシュ値です。
`queries` を変更すると自動的に新しいハッシュが計算され、
新規のカーソルで取得が開始されます。

jobs.yaml を編集する必要はありません。
```

---

## 4. Verify（検証手順）

### 4.1 ユニットテスト

```bash
npm test -- test/db/dao.test.ts
npm test -- test/collectors/google-books.test.ts
npm test -- test/commands/job-cursor-reset.test.ts
```

### 4.2 統合テスト

```bash
npm test -- test/integration/run-due.test.ts
```

### 4.3 全テスト

```bash
npm test
```

### 4.4 手動確認

```bash
# 1. 初回実行（startIndex=0 から）
dre run-due --dry-run

# 2. カーソル確認（DB 直接）
sqlite3 data/app.db "SELECT * FROM collect_cursor"

# 3. 再実行（カーソル継続確認）
dre run-due --dry-run

# 4. リセット
dre job cursor reset <job-name> --yes

# 5. リセット後確認
sqlite3 data/app.db "SELECT * FROM collect_cursor WHERE job_name='<job-name>'"
```

---

## 5. DoD（Definition of Done）チェックリスト

- [ ] `collect_cursor` テーブルが作成される
- [ ] ページングで複数ページを取得できる（startIndex が進む）
- [ ] **maxPerRun < 40 のとき overfetch しない**
- [ ] カーソルが永続化され、次回実行で継続する
- [ ] **UPSERT で INSERT/UPDATE 両方で last_updated_at が更新される**
- [ ] クエリ変更時に query_set_hash が変わり旧カーソルを引き継がない
- [ ] 枯渇時に warn ログ + 停止状態が記録される
- [ ] **API エラー/クォータ停止時は is_exhausted=false のまま（誤枯渇防止）**
- [ ] **totalItems=0 の場合、start_index=0 + is_exhausted=true で正しく処理される**
- [ ] 停止状態のジョブは次回 run でスキップされる
- [ ] `dre job cursor reset <job-name> --yes` でリセットできる
- [ ] `docs/ops/collect.md` にカーソル/枯渇/リセットが記載されている
- [ ] 全テストがパスする

---

## 6. リスク・注意事項

### 6.1 API クォータとの関係

- 1 run 内で複数ページを取得するため、API 呼び出し回数が増加する
- 既存の `quota.ts` による日次制限は維持される
- ページング中にクォータ切れになった場合は「上限到達」として停止（枯渇ではない）

### 6.2 既存フローへの影響

- Collect の戻り値に `cursorState` が追加されるが、Upsert/Select/Mail には影響なし
- `run-due` 内でカーソル読み書きを追加するが、既存ロジックは変更しない

### 6.3 マイグレーション

- 新テーブル追加のみ（既存テーブル変更なし）
- `CREATE TABLE IF NOT EXISTS` で既存 DB にも適用可能
