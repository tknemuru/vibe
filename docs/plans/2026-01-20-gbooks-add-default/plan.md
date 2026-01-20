# Plan: dre job add に google_books デフォルト適用

## 概要

`dre job add` コマンドで `google_books` 設定（printType / langRestrict）を指定可能にし、
未指定時はデフォルト値を適用する。これにより、CLI で追加した Job が
`jobs.yaml` の必須スキーマ（google_books 必須）を満たすようになる。

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `src/commands/job.ts` | `dre job add` に `--print-type` / `--lang-restrict` オプション追加、デフォルト適用 |
| `test/commands/job-add.test.ts` | 新規: `dre job add` のユニットテスト |

---

## 実装詳細

### 1. `src/commands/job.ts` の変更

#### 1.1 新オプション追加（68-77 行目付近）

```typescript
.option("--print-type <type>", "Google Books printType (default: books)")
.option("--lang-restrict <lang>", "Google Books langRestrict (default: ja)")
```

#### 1.2 デフォルト値の定数化（ファイル先頭）

```typescript
const DEFAULT_GOOGLE_BOOKS = {
  printType: "books",
  langRestrict: "ja",
};
```

#### 1.3 newJob 構築時に google_books を追加（94-100 行目付近）

```typescript
const newJob = {
  name: options.name,
  queries,
  enabled: !options.disabled,
  google_books: {
    printType: options.printType ?? DEFAULT_GOOGLE_BOOKS.printType,
    langRestrict: options.langRestrict ?? DEFAULT_GOOGLE_BOOKS.langRestrict,
  },
  ...(options.mailLimit && { mail_limit: options.mailLimit }),
  ...(options.maxPerRun && { max_per_run: options.maxPerRun }),
};
```

#### 1.4 成功メッセージに google_books 情報を追加

```typescript
console.log(`  google_books: printType=${newJob.google_books.printType}, langRestrict=${newJob.google_books.langRestrict}`);
```

---

### 2. `test/commands/job-add.test.ts`（新規）

テストケース:
1. **デフォルト適用テスト**: `--print-type` / `--lang-restrict` 未指定時に `books` / `ja` が設定される
2. **明示指定テスト**: `--print-type magazines --lang-restrict en` 指定時にその値が設定される
3. **部分指定テスト**: `--print-type` のみ指定時、`langRestrict` はデフォルト（ja）になる

テスト方法:
- `addJob` 関数を直接テストする（CLI の E2E テストは Verify で代替）
- 一時的な config オブジェクトを使用し、ファイル I/O を避ける

---

## CLI ヘルプ表示

変更後の `dre job add --help`:

```
Usage: dre job add [options]

Add a new job

Options:
  -n, --name <name>           Job name (unique)
  -q, --query <query>         Single search query
  --queries <queries>         Multiple search queries (comma-separated)
  --mail-limit <limit>        Override default mail_limit
  --max-per-run <limit>       Override default max_per_run
  --print-type <type>         Google Books printType (default: books)
  --lang-restrict <lang>      Google Books langRestrict (default: ja)
  --disabled                  Create job as disabled
  -h, --help                  display help for command
```

---

## jobs.yaml 保存仕様

追加される Job には必ず `google_books` が含まれる:

```yaml
jobs:
  - name: smoke
    queries:
      - AI
    enabled: true
    google_books:
      printType: books
      langRestrict: ja
```

---

## DoD（Definition of Done）

1. `dre job add -n <name> -q <query>` で `google_books` がデフォルト値で保存される
2. `dre job add -n <name> -q <query> --print-type <type> --lang-restrict <lang>` で明示値が保存される
3. 追加後の `dre job ls` がエラーなく動作する
4. 既存テストがすべてパスする
5. 新規テストがすべてパスする

---

## Verify コマンド

```bash
# ビルド確認
npm run build

# 既存テスト + 新規テスト
npm test

# E2E: デフォルト適用
dre job add -n smoke -q "AI"
# → jobs.yaml に google_books: { printType: books, langRestrict: ja } が入ること

# E2E: 明示指定
dre job add -n smoke2 -q "AI" --print-type books --lang-restrict ja
# → jobs.yaml に指定値が入ること

# E2E: job ls が動作すること
dre job ls

# クリーンアップ
dre job rm smoke
dre job rm smoke2
```

---

## Rollback 方針

- `src/commands/job.ts` の変更を `git revert` で切り戻す
- 追加したテストファイル `test/commands/job-add.test.ts` を削除
- `config/jobs.yaml` は手動で編集して追加した Job を削除（または git restore）
