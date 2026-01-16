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

    -- Ver4.0: deliveries テーブル（監査ログ）
    CREATE TABLE IF NOT EXISTS deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name TEXT NOT NULL,
      delivered_at TEXT NOT NULL,
      isbn13_list_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_deliveries_job ON deliveries(job_name);

    -- Ver4.0: delivery_items テーブル（SSOT）
    CREATE TABLE IF NOT EXISTS delivery_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      delivery_id INTEGER NOT NULL,
      job_name TEXT NOT NULL,
      isbn13 TEXT NOT NULL,
      delivered_at TEXT NOT NULL,
      UNIQUE(job_name, isbn13),
      FOREIGN KEY (delivery_id) REFERENCES deliveries(id)
    );

    CREATE INDEX IF NOT EXISTS idx_delivery_items_job ON delivery_items(job_name);
    CREATE INDEX IF NOT EXISTS idx_delivery_items_isbn13 ON delivery_items(isbn13);
    CREATE INDEX IF NOT EXISTS idx_delivery_items_delivery ON delivery_items(delivery_id);

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

/**
 * 配信記録を作成する（テスト用）
 * @param db - Databaseインスタンス
 * @param jobName - ジョブ名
 * @param isbn13List - 配信したISBN-13のリスト
 * @returns 作成された配信記録のID
 */
export function insertTestDelivery(
  db: Database.Database,
  jobName: string,
  isbn13List: string[]
): number {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO deliveries (job_name, delivered_at, isbn13_list_json)
       VALUES (?, ?, ?)`
    )
    .run(jobName, now, JSON.stringify(isbn13List));
  return result.lastInsertRowid as number;
}

/**
 * 配信アイテムを記録する（テスト用）
 * @param db - Databaseインスタンス
 * @param deliveryId - 配信ID
 * @param jobName - ジョブ名
 * @param isbn13 - ISBN-13
 * @param deliveredAt - 配信日時（省略時は現在時刻）
 */
export function insertTestDeliveryItem(
  db: Database.Database,
  deliveryId: number,
  jobName: string,
  isbn13: string,
  deliveredAt?: string
): void {
  const now = deliveredAt ?? new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO delivery_items (delivery_id, job_name, isbn13, delivered_at)
     VALUES (?, ?, ?, ?)`
  ).run(deliveryId, jobName, isbn13, now);
}
