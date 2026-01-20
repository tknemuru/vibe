# Plan: 2026-01-20-fix-search-cond

## 概要

Google Books API 検索条件の設定化とログ改善により、no ISBN 混入率の測定・改善を可能にする。

**方針: 破壊的変更（後方互換なし）**

## 現状分析

- `printType=books` と `langRestrict=ja` は既に `src/collectors/google-books.ts:146-147` でハードコード実装済み
- ログに検索条件（printType / langRestrict）が未表示
- Pipeline Summary に no ISBN 比率が未表示
- collector のユニットテストが未作成
- jobs.yaml から検索条件をオーバーライドする機能がない

## 変更ファイル一覧

1. `src/config/jobs.ts` - 設定インターフェース拡張（必須項目として追加）
2. `config/jobs.yaml` - 既存ジョブに `google_books` 設定を追加
3. `src/collectors/google-books.ts` - 設定の受け渡し・ログ改善
4. `src/commands/run-due.ts` - ログに no ISBN 比率を追加
5. `test/collectors/google-books.test.ts` - ユニットテスト新規作成

## 設計詳細

### 1. 設定インターフェース拡張 (`src/config/jobs.ts`)

```typescript
// Google Books 検索オプション（必須）
export interface GoogleBooksConfig {
  printType: string;    // 必須: "books" など
  langRestrict: string; // 必須: "ja" など
}

// Job に追加（必須項目）
export interface Job {
  // ...既存フィールド
  google_books: GoogleBooksConfig; // 必須
}
```

**バリデーション:**
- `google_books` セクションが未指定 → `JobsConfigError` で fail-fast
- `google_books.printType` が未指定または空 → `JobsConfigError` で fail-fast
- `google_books.langRestrict` が未指定または空 → `JobsConfigError` で fail-fast

```typescript
// validateJob 内での検証
if (!j.google_books || typeof j.google_books !== "object") {
  throw new JobsConfigError(`jobs[${index}].google_books is required`);
}
if (typeof j.google_books.printType !== "string" || j.google_books.printType.trim() === "") {
  throw new JobsConfigError(`jobs[${index}].google_books.printType is required`);
}
if (typeof j.google_books.langRestrict !== "string" || j.google_books.langRestrict.trim() === "") {
  throw new JobsConfigError(`jobs[${index}].google_books.langRestrict is required`);
}
```

### 2. jobs.yaml の更新 (`config/jobs.yaml`)

既存の全ジョブに `google_books` 設定を追加:

```yaml
jobs:
  - name: consultant-books
    enabled: true
    queries:
      - コンサルタント 仕事
    google_books:
      printType: books
      langRestrict: ja
  - name: ai-books
    enabled: true
    queries:
      - AI
    google_books:
      printType: books
      langRestrict: ja
  - name: nonfiction-books
    enabled: true
    queries:
      - ノンフィクション
    google_books:
      printType: books
      langRestrict: ja
  - name: architecture-books
    enabled: true
    queries:
      - ソフトウェア アーキテクチャ
    google_books:
      printType: books
      langRestrict: ja
```

### 3. Collector の設定受け渡し (`src/collectors/google-books.ts`)

```typescript
// 検索オプションインターフェース（必須）
export interface GoogleBooksSearchOptions {
  printType: string;
  langRestrict: string;
}

// collect メソッドのシグネチャ変更
async collect(
  queries: string[],
  maxPerRun: number,
  options: GoogleBooksSearchOptions  // 必須引数
): Promise<CollectorResult>;
```

**ログ出力改善:**
```
[Collect] query="AI", printType=books, langRestrict=ja, totalItems=150, returned=20, skipped=5 (no ISBN)
```

### 4. Pipeline Summary に no ISBN 比率追加 (`src/commands/run-due.ts`)

```
=== Pipeline Summary ===
API totalItems:     150
API returned:       60
After ISBN filter:  48
ISBN hit rate:      80.0% (48/60)   ← 新規追加
Upsert result:      inserted=10, updated=38
DB undelivered:     10
Selected for mail:  5
```

### 5. ユニットテスト (`test/collectors/google-books.test.ts`)

テスト項目:
1. リクエスト URL に指定した `printType` が含まれること
2. リクエスト URL に指定した `langRestrict` が含まれること
3. ISBN のない volume がスキップされること
4. ISBN-13 / ISBN-10 の正規化が機能すること
5. ログに `printType` / `langRestrict` が出力されること

モック: `fetch` をモックして外部 API 呼び出しを回避

## DoD (Definition of Done)

1. [ ] `npm run build` が成功する
2. [ ] `npm test` が全て通る
3. [ ] 新規テスト `test/collectors/google-books.test.ts` が存在し通過
4. [ ] `[Collect]` ログに `printType` / `langRestrict` が表示される
5. [ ] Pipeline Summary に `ISBN hit rate` が表示される
6. [ ] `google_books` 設定なしの jobs.yaml で起動時エラーになる（fail-fast）

## Verify コマンド

```bash
# 1. ビルド確認
npm run build

# 2. テスト実行
npm test

# 3. 実行確認（効果測定）
dre run-due --force | tee vibe-debug.log
```

**判定観点:**
1. 各クエリで `skipped(no ISBN)` が減る、または `ISBN hit rate` が改善している
2. `max_per_run` / `mail_limit` の挙動が変わっていない

## Rollback 方針

破壊的変更のため、切り戻しは以下の方法で行う:

1. **コミット revert**: 該当コミットを `git revert` で戻す
2. **jobs.yaml の復元**: `google_books` セクションを削除した旧形式に戻す

※ 後方互換がないため、部分的な切り戻しは不可

## 非機能要件への対応

- API key はログに出力しない（既存実装で対応済み）
- ログは 1 行形式を維持（追加項目も同一行に含める）
- Doc コメントは日本語で記述

## 破壊的変更の影響

- 既存の jobs.yaml は `google_books` 設定追加が必須
- 設定なしで起動すると即座にエラー終了
- マイグレーション手順: 各ジョブに `google_books` セクションを追加
