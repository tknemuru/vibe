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

    // Ver4.0 マイグレーション（既存DBの場合）
    if (needsMigrationToV4(db)) {
      migrateToV4(db);
    }

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
 * ログ出力用ヘルパー
 */
function log(level: "INFO" | "WARN" | "ERROR", message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
}

/**
 * Ver4.0 マイグレーションが必要かどうかを判定する
 * @param db - データベースインスタンス
 * @returns マイグレーションが必要な場合は true
 */
function needsMigrationToV4(db: Database.Database): boolean {
  // deliveries テーブルが存在するか確認
  const tableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='deliveries'"
    )
    .get();

  if (!tableExists) {
    log("INFO", "[Migration] deliveries table not found, migration not needed");
    return false;
  }

  // PRAGMA table_info で deliveries テーブルのカラム情報を取得
  const columns = db.prepare("PRAGMA table_info(deliveries)").all() as {
    name: string;
  }[];
  const hasItemHashes = columns.some((col) => col.name === "item_hashes_json");

  if (hasItemHashes) {
    log("INFO", "[Migration] item_hashes_json detected, migration required");
    return true;
  } else {
    log("INFO", "[Migration] Migration skipped (item_hashes_json not found)");
    return false;
  }
}

/**
 * Ver4.0 マイグレーションを実行する
 * - deliveries テーブルから item_hashes_json を削除（テーブル再作成）
 * - delivery_items テーブルを作成
 * - 既存データを移行
 * @param db - データベースインスタンス
 */
function migrateToV4(db: Database.Database): void {
  log("INFO", "[Migration] Starting Ver4.0 migration...");

  db.transaction(() => {
    // Step 1: 新テーブル作成
    db.exec(`
      CREATE TABLE deliveries_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_name TEXT NOT NULL,
        delivered_at TEXT NOT NULL,
        isbn13_list_json TEXT NOT NULL
      )
    `);

    // Step 2: データ移行（item_hashes_json は捨てる）
    // isbn13_list_json が存在しない場合は空配列を設定
    const hasIsbn13ListJson = (
      db.prepare("PRAGMA table_info(deliveries)").all() as { name: string }[]
    ).some((col) => col.name === "isbn13_list_json");

    if (hasIsbn13ListJson) {
      db.exec(`
        INSERT INTO deliveries_new (id, job_name, delivered_at, isbn13_list_json)
        SELECT id, job_name, delivered_at, isbn13_list_json
        FROM deliveries
      `);
    } else {
      db.exec(`
        INSERT INTO deliveries_new (id, job_name, delivered_at, isbn13_list_json)
        SELECT id, job_name, delivered_at, '[]'
        FROM deliveries
      `);
    }

    // Step 3: 旧テーブル削除
    db.exec("DROP TABLE deliveries");

    // Step 4: リネーム
    db.exec("ALTER TABLE deliveries_new RENAME TO deliveries");

    // Step 5: インデックス再作成
    db.exec("CREATE INDEX idx_deliveries_job ON deliveries(job_name)");

    // Step 6: delivery_items テーブル作成
    db.exec(`
      CREATE TABLE IF NOT EXISTS delivery_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        delivery_id INTEGER NOT NULL,
        job_name TEXT NOT NULL,
        isbn13 TEXT NOT NULL,
        delivered_at TEXT NOT NULL,
        UNIQUE(job_name, isbn13),
        FOREIGN KEY (delivery_id) REFERENCES deliveries(id)
      )
    `);

    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_delivery_items_job ON delivery_items(job_name)"
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_delivery_items_isbn13 ON delivery_items(isbn13)"
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_delivery_items_delivery ON delivery_items(delivery_id)"
    );

    // Step 7: 既存の isbn13_list_json を展開して delivery_items に移行
    const deliveries = db
      .prepare(
        "SELECT id, job_name, delivered_at, isbn13_list_json FROM deliveries"
      )
      .all() as {
      id: number;
      job_name: string;
      delivered_at: string;
      isbn13_list_json: string;
    }[];

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO delivery_items (delivery_id, job_name, isbn13, delivered_at)
      VALUES (?, ?, ?, ?)
    `);

    let totalItems = 0;
    for (const d of deliveries) {
      try {
        const isbn13List = JSON.parse(d.isbn13_list_json) as string[];
        for (const isbn13 of isbn13List) {
          insertStmt.run(d.id, d.job_name, isbn13, d.delivered_at);
          totalItems++;
        }
      } catch {
        log(
          "WARN",
          `[Migration] Failed to parse isbn13_list_json for delivery ${d.id}`
        );
      }
    }

    log(
      "INFO",
      `[Migration] Migrated ${deliveries.length} deliveries, ${totalItems} delivery_items`
    );
  })();

  log("INFO", "[Migration] Ver4.0 migration completed");
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
    -- Ver4.0 配信記録テーブル（監査ログ）
    -- ============================================
    CREATE TABLE IF NOT EXISTS deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name TEXT NOT NULL,
      delivered_at TEXT NOT NULL,
      isbn13_list_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_deliveries_job ON deliveries(job_name);

    -- ============================================
    -- Ver4.0 配信アイテムテーブル（SSOT）
    -- ============================================
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

    -- ============================================
    -- Collect カーソルテーブル（ページング状態管理）
    -- ============================================
    CREATE TABLE IF NOT EXISTS collect_cursor (
      job_name TEXT NOT NULL,
      query_set_hash TEXT NOT NULL,
      start_index INTEGER NOT NULL DEFAULT 0,
      is_exhausted INTEGER NOT NULL DEFAULT 0,
      last_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (job_name, query_set_hash)
    );

    CREATE INDEX IF NOT EXISTS idx_collect_cursor_job ON collect_cursor(job_name);
  `);
}
