/**
 * テスト用データベースヘルパー
 * @description
 *   インメモリSQLiteを使用してテスト用のデータベースを提供する。
 *   各テストで独立したDBインスタンスを使用できる。
 */

import Database from "better-sqlite3";

/**
 * テスト用DBのスキーマを初期化する
 * @param db - better-sqlite3のDatabaseインスタンス
 */
export function initTestSchema(db: Database.Database): void {
  db.exec(`
    -- books テーブル
    CREATE TABLE IF NOT EXISTS books (
      isbn13 TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      authors_json TEXT,
      publisher TEXT,
      published_date TEXT,
      description TEXT,
      cover_url TEXT,
      links_json TEXT,
      source TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      last_delivered_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_books_undelivered
      ON books(last_delivered_at) WHERE last_delivered_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_books_last_seen ON books(last_seen_at);

    -- book_deliveries テーブル
    CREATE TABLE IF NOT EXISTS book_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name TEXT NOT NULL,
      delivered_at TEXT NOT NULL,
      isbn13_list_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_book_deliveries_job ON book_deliveries(job_name);

    -- job_state テーブル
    CREATE TABLE IF NOT EXISTS job_state (
      job_name TEXT PRIMARY KEY,
      last_success_at TEXT,
      last_run_at TEXT
    );

    -- api_usage テーブル
    CREATE TABLE IF NOT EXISTS api_usage (
      date TEXT NOT NULL,
      provider TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (date, provider)
    );

    -- prompts テーブル（Ver3.0で追加）
    CREATE TABLE IF NOT EXISTS prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      isbn13 TEXT NOT NULL,
      prompt_text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_prompts_isbn13 ON prompts(isbn13);

    -- prompt_tokens テーブル（Ver3.0で追加）
    CREATE TABLE IF NOT EXISTS prompt_tokens (
      token TEXT PRIMARY KEY,
      prompt_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (prompt_id) REFERENCES prompts(id)
    );

    CREATE INDEX IF NOT EXISTS idx_prompt_tokens_expires ON prompt_tokens(expires_at);
  `);
}

/**
 * テスト用のインメモリDBを作成する
 * @returns 初期化済みのDatabaseインスタンス
 */
export function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  initTestSchema(db);
  return db;
}

/**
 * テスト用の書籍データを作成するファクトリ
 */
export interface TestBookInput {
  isbn13?: string;
  title?: string;
  authors?: string[];
  publisher?: string;
  published_date?: string;
  description?: string;
  cover_url?: string;
  source?: string;
}

/**
 * テスト用の書籍データを生成する
 * @param overrides - 上書きするフィールド
 * @returns 書籍入力データ
 */
export function createTestBookInput(overrides: TestBookInput = {}): {
  isbn13: string;
  title: string;
  authors: string[];
  publisher: string;
  published_date: string;
  description: string;
  cover_url: string;
  source: string;
} {
  return {
    isbn13: overrides.isbn13 ?? "9784873119083",
    title: overrides.title ?? "テスト書籍",
    authors: overrides.authors ?? ["テスト著者"],
    publisher: overrides.publisher ?? "テスト出版社",
    published_date: overrides.published_date ?? "2024-01-01",
    description: overrides.description ?? "テスト説明文",
    cover_url: overrides.cover_url ?? "https://example.com/cover.jpg",
    source: overrides.source ?? "test",
  };
}

/**
 * DBに書籍を直接挿入する（テスト用）
 * @param db - Databaseインスタンス
 * @param book - 書籍データ
 * @param options - オプション（last_delivered_atの設定など）
 */
export function insertTestBook(
  db: Database.Database,
  book: ReturnType<typeof createTestBookInput>,
  options: { delivered?: boolean; firstSeenAt?: string; lastSeenAt?: string } = {}
): void {
  const now = new Date().toISOString();
  const firstSeenAt = options.firstSeenAt ?? now;
  const lastSeenAt = options.lastSeenAt ?? now;
  const lastDeliveredAt = options.delivered ? now : null;

  db.prepare(
    `INSERT INTO books (
      isbn13, title, authors_json, publisher, published_date,
      description, cover_url, links_json, source,
      first_seen_at, last_seen_at, last_delivered_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    book.isbn13,
    book.title,
    JSON.stringify(book.authors),
    book.publisher,
    book.published_date,
    book.description,
    book.cover_url,
    null,
    book.source,
    firstSeenAt,
    lastSeenAt,
    lastDeliveredAt
  );
}
