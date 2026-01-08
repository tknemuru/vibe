import Database from "better-sqlite3";
import { resolve } from "path";
import { existsSync, mkdirSync } from "fs";

const DB_PATH = resolve(process.cwd(), "data/app.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    // Ensure data directory exists
    const dataDir = resolve(process.cwd(), "data");
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    initSchema(db);
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function initSchema(db: Database.Database): void {
  db.exec(`
    -- Items table: stores search results
    CREATE TABLE IF NOT EXISTS items (
      item_hash TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      snippet TEXT,
      domain TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      last_delivered_at TEXT,
      summary_json TEXT
    );

    -- Index for finding undelivered items
    CREATE INDEX IF NOT EXISTS idx_items_undelivered
      ON items(last_delivered_at) WHERE last_delivered_at IS NULL;

    -- Index for domain-based queries
    CREATE INDEX IF NOT EXISTS idx_items_domain ON items(domain);

    -- Deliveries table: tracks what was sent and when
    CREATE TABLE IF NOT EXISTS deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name TEXT NOT NULL,
      delivered_at TEXT NOT NULL,
      item_hashes_json TEXT NOT NULL
    );

    -- Index for finding deliveries by job
    CREATE INDEX IF NOT EXISTS idx_deliveries_job ON deliveries(job_name);

    -- Feedback table: user ratings
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_hash TEXT NOT NULL,
      rating INTEGER NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (item_hash) REFERENCES items(item_hash)
    );

    -- Index for feedback by item
    CREATE INDEX IF NOT EXISTS idx_feedback_item ON feedback(item_hash);

    -- Job state table: tracks last run times
    CREATE TABLE IF NOT EXISTS job_state (
      job_name TEXT PRIMARY KEY,
      last_success_at TEXT,
      last_run_at TEXT
    );

    -- API usage table: tracks daily API calls
    CREATE TABLE IF NOT EXISTS api_usage (
      date TEXT NOT NULL,
      provider TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (date, provider)
    );
  `);
}
