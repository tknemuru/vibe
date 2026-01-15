import Database from "better-sqlite3";
import { resolve } from "path";
import { existsSync, mkdirSync, copyFileSync, unlinkSync } from "fs";

const DB_PATH = resolve(process.cwd(), "data/app.db");

let db: Database.Database | null = null;

/**
 * テスト用：DBインスタンスを差し替える
 * @param testDb - 差し替えるDBインスタンス（nullでリセット）
 */
export function setDb(testDb: Database.Database | null): void {
  if (db && db !== testDb) {
    db.close();
  }
  db = testDb;
}

/**
 * データベースインスタンスを取得する
 * @returns SQLiteデータベースインスタンス
 * @description
 *   初回呼び出し時にデータディレクトリを作成し、
 *   データベースを初期化する。
 */
export function getDb(): Database.Database {
  if (!db) {
    // データディレクトリを作成
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

/**
 * データベース接続を閉じる
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * データベースファイルのパスを取得する
 * @returns データベースファイルの絶対パス
 */
export function getDbPath(): string {
  return DB_PATH;
}

/**
 * データベースをリセットする
 * @returns バックアップファイルのパス
 * @description
 *   既存データベースをタイムスタンプ付きでバックアップし、
 *   新しいデータベースを作成する。
 */
export function resetDatabase(): { backupPath: string } {
  // 既存接続を閉じる
  closeDb();

  // タイムスタンプ付きバックアップを作成
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupPath = `${DB_PATH}.bak.${timestamp}`;

  if (existsSync(DB_PATH)) {
    copyFileSync(DB_PATH, backupPath);
    // オリジナルを削除
    unlinkSync(DB_PATH);
    // WAL/SHMファイルも削除
    const walPath = `${DB_PATH}-wal`;
    const shmPath = `${DB_PATH}-shm`;
    if (existsSync(walPath)) unlinkSync(walPath);
    if (existsSync(shmPath)) unlinkSync(shmPath);
  }

  // 新しいデータベースで再初期化
  getDb();

  return { backupPath: existsSync(backupPath) ? backupPath : "(no backup - database was empty)" };
}

/**
 * データベーススキーマを初期化する
 * @param db - データベースインスタンス
 */
function initSchema(db: Database.Database): void {
  db.exec(`
    -- ============================================
    -- Ver2.0 書籍テーブル
    -- ============================================
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

    -- 未配信書籍検索用インデックス
    CREATE INDEX IF NOT EXISTS idx_books_undelivered
      ON books(last_delivered_at) WHERE last_delivered_at IS NULL;

    -- 最終検出日時ソート用インデックス
    CREATE INDEX IF NOT EXISTS idx_books_last_seen ON books(last_seen_at);

    -- ============================================
    -- Ver2.0 配信記録テーブル
    -- ============================================
    CREATE TABLE IF NOT EXISTS book_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name TEXT NOT NULL,
      delivered_at TEXT NOT NULL,
      isbn13_list_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_book_deliveries_job ON book_deliveries(job_name);

    -- ============================================
    -- 共通テーブル
    -- ============================================

    -- ジョブ状態テーブル
    CREATE TABLE IF NOT EXISTS job_state (
      job_name TEXT PRIMARY KEY,
      last_success_at TEXT,
      last_run_at TEXT
    );

    -- API利用量テーブル
    CREATE TABLE IF NOT EXISTS api_usage (
      date TEXT NOT NULL,
      provider TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (date, provider)
    );

    -- ============================================
    -- Ver3.0 Prompt tables
    -- ============================================

    -- prompts テーブル: Deep Research用プロンプトを保存
    CREATE TABLE IF NOT EXISTS prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      isbn13 TEXT NOT NULL,
      prompt_text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_prompts_isbn13 ON prompts(isbn13);

    -- prompt_tokens テーブル: プロンプトへのアクセストークン
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
