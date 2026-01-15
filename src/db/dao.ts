import { getDb } from "./init.js";
import { randomBytes } from "crypto";

// ============================================
// 型定義
// ============================================

/**
 * 書籍エンティティ（Ver2.0）
 */
export interface Book {
  isbn13: string;
  title: string;
  authors_json: string | null;
  publisher: string | null;
  published_date: string | null;
  description: string | null;
  cover_url: string | null;
  links_json: string | null;
  source: string;
  first_seen_at: string;
  last_seen_at: string;
  last_delivered_at: string | null;
}

/**
 * 書籍入力データ（タイムスタンプなし、upsert用）
 */
export interface BookInput {
  isbn13: string;
  title: string;
  authors?: string[];
  publisher?: string;
  published_date?: string;
  description?: string;
  cover_url?: string;
  links?: Array<{ label: string; url: string }>;
  source: string;
}

/**
 * 書籍配信記録（Ver2.0）
 */
export interface BookDelivery {
  id: number;
  job_name: string;
  delivered_at: string;
  isbn13_list_json: string;
}

export interface JobState {
  job_name: string;
  last_success_at: string | null;
  last_run_at: string | null;
}

export interface ApiUsage {
  date: string;
  provider: string;
  count: number;
}

// ============================================
// 書籍操作（Ver2.0）
// ============================================

/**
 * ISBN-13を正規化する
 * @param isbn - ISBN文字列（ISBN-10またはISBN-13）
 * @returns 正規化されたISBN-13、無効な場合はnull
 * @description
 *   - ハイフンとスペースを除去
 *   - ISBN-10の場合はISBN-13に変換
 */
export function normalizeIsbn13(isbn: string): string | null {
  if (!isbn) return null;

  // Remove hyphens and spaces
  const cleaned = isbn.replace(/[-\s]/g, "");

  // Check if it's ISBN-13
  if (cleaned.length === 13 && /^\d{13}$/.test(cleaned)) {
    return cleaned;
  }

  // Check if it's ISBN-10, convert to ISBN-13
  if (cleaned.length === 10 && /^\d{9}[\dXx]$/.test(cleaned)) {
    return convertIsbn10To13(cleaned);
  }

  return null;
}

/**
 * ISBN-10をISBN-13に変換する
 * @param isbn10 - ISBN-10文字列
 * @returns ISBN-13文字列
 */
function convertIsbn10To13(isbn10: string): string {
  // Prepend 978
  const isbn13Base = "978" + isbn10.slice(0, 9);

  // Calculate check digit
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(isbn13Base[i], 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const checkDigit = (10 - (sum % 10)) % 10;

  return isbn13Base + checkDigit;
}

/**
 * 書籍をupsertする（ISBN-13で挿入または更新）
 * @param input - 書籍入力データ
 * @returns upsertされた書籍エンティティ
 * @throws ISBNが無効な場合はエラー
 */
export function upsertBook(input: BookInput): Book {
  const db = getDb();
  const now = new Date().toISOString();

  const isbn13 = normalizeIsbn13(input.isbn13);
  if (!isbn13) {
    throw new Error(`Invalid ISBN: ${input.isbn13}`);
  }

  const authorsJson = input.authors ? JSON.stringify(input.authors) : null;
  const linksJson = input.links ? JSON.stringify(input.links) : null;

  const existing = db
    .prepare("SELECT * FROM books WHERE isbn13 = ?")
    .get(isbn13) as Book | undefined;

  if (existing) {
    // Update existing book
    db.prepare(
      `UPDATE books SET
        title = ?,
        authors_json = COALESCE(?, authors_json),
        publisher = COALESCE(?, publisher),
        published_date = COALESCE(?, published_date),
        description = COALESCE(?, description),
        cover_url = COALESCE(?, cover_url),
        links_json = COALESCE(?, links_json),
        last_seen_at = ?
       WHERE isbn13 = ?`
    ).run(
      input.title,
      authorsJson,
      input.publisher || null,
      input.published_date || null,
      input.description || null,
      input.cover_url || null,
      linksJson,
      now,
      isbn13
    );

    return {
      ...existing,
      title: input.title,
      authors_json: authorsJson ?? existing.authors_json,
      publisher: input.publisher ?? existing.publisher,
      published_date: input.published_date ?? existing.published_date,
      description: input.description ?? existing.description,
      cover_url: input.cover_url ?? existing.cover_url,
      links_json: linksJson ?? existing.links_json,
      last_seen_at: now,
    };
  } else {
    // Insert new book
    db.prepare(
      `INSERT INTO books (
        isbn13, title, authors_json, publisher, published_date,
        description, cover_url, links_json, source,
        first_seen_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      isbn13,
      input.title,
      authorsJson,
      input.publisher || null,
      input.published_date || null,
      input.description || null,
      input.cover_url || null,
      linksJson,
      input.source,
      now,
      now
    );

    return {
      isbn13,
      title: input.title,
      authors_json: authorsJson,
      publisher: input.publisher || null,
      published_date: input.published_date || null,
      description: input.description || null,
      cover_url: input.cover_url || null,
      links_json: linksJson,
      source: input.source,
      first_seen_at: now,
      last_seen_at: now,
      last_delivered_at: null,
    };
  }
}

/**
 * ISBN-13で書籍を取得する
 * @param isbn13 - ISBN-13文字列
 * @returns 書籍エンティティ、見つからない場合はundefined
 */
export function getBookByIsbn(isbn13: string): Book | undefined {
  const db = getDb();
  const normalized = normalizeIsbn13(isbn13);
  if (!normalized) return undefined;

  return db.prepare("SELECT * FROM books WHERE isbn13 = ?").get(normalized) as
    | Book
    | undefined;
}

/**
 * 未配信の書籍一覧を取得する
 * @param limit - 取得件数上限
 * @returns 未配信書籍の配列
 */
export function listUndeliveredBooks(limit: number = 100): Book[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM books
       WHERE last_delivered_at IS NULL
       ORDER BY first_seen_at DESC
       LIMIT ?`
    )
    .all(limit) as Book[];
}

/**
 * 最近の書籍一覧を取得する（未配信がない場合のフォールバック用）
 * @param limit - 取得件数上限
 * @returns 書籍の配列（配信状態問わず）
 */
export function listRecentBooks(limit: number = 10): Book[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM books
       ORDER BY last_seen_at DESC
       LIMIT ?`
    )
    .all(limit) as Book[];
}

/**
 * メール送信用の書籍を選択する（未配信優先 + フォールバック）
 * @param mailLimit - メール掲載上限件数
 * @param fallbackLimit - フォールバック時の件数
 * @returns 書籍配列とフォールバックフラグ
 */
export function selectBooksForMail(
  mailLimit: number,
  fallbackLimit: number
): { books: Book[]; isFallback: boolean } {
  const undelivered = listUndeliveredBooks(mailLimit);

  if (undelivered.length > 0) {
    return { books: undelivered, isFallback: false };
  }

  // フォールバック: 最近の書籍（配信済み含む）
  const recent = listRecentBooks(fallbackLimit);
  return { books: recent, isFallback: true };
}

/**
 * 書籍を配信済みとしてマークする
 * @param isbn13List - 配信済みにするISBN-13のリスト
 */
export function markBooksDelivered(isbn13List: string[]): void {
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    "UPDATE books SET last_delivered_at = ? WHERE isbn13 = ?"
  );

  const transaction = db.transaction((list: string[]) => {
    for (const isbn13 of list) {
      const normalized = normalizeIsbn13(isbn13);
      if (normalized) {
        stmt.run(now, normalized);
      }
    }
  });

  transaction(isbn13List);
}

/**
 * 書籍配信記録を作成する
 * @param jobName - ジョブ名
 * @param isbn13List - 配信したISBN-13のリスト
 * @returns 作成された配信記録
 */
export function createBookDelivery(
  jobName: string,
  isbn13List: string[]
): BookDelivery {
  const db = getDb();
  const now = new Date().toISOString();
  const isbn13ListJson = JSON.stringify(isbn13List);

  const result = db
    .prepare(
      `INSERT INTO book_deliveries (job_name, delivered_at, isbn13_list_json)
       VALUES (?, ?, ?)`
    )
    .run(jobName, now, isbn13ListJson);

  return {
    id: result.lastInsertRowid as number,
    job_name: jobName,
    delivered_at: now,
    isbn13_list_json: isbn13ListJson,
  };
}

/**
 * 書籍の配信状態をリセットする
 * @param options - リセットオプション
 * @param options.jobName - 特定ジョブで配信された書籍のみリセット
 * @param options.sinceDays - N日以内に配信された書籍のみリセット
 * @returns リセットされた書籍数
 */
export function resetBooksDelivered(options?: {
  jobName?: string;
  sinceDays?: number;
}): number {
  const db = getDb();

  if (options?.jobName) {
    // 特定ジョブで配信された書籍のみリセット
    const deliveries = db
      .prepare(
        "SELECT isbn13_list_json FROM book_deliveries WHERE job_name = ?"
      )
      .all(options.jobName) as { isbn13_list_json: string }[];

    const isbn13Set = new Set<string>();
    for (const d of deliveries) {
      const list = JSON.parse(d.isbn13_list_json) as string[];
      list.forEach((isbn) => isbn13Set.add(isbn));
    }

    if (isbn13Set.size === 0) return 0;

    const placeholders = Array(isbn13Set.size).fill("?").join(",");
    const result = db
      .prepare(
        `UPDATE books SET last_delivered_at = NULL
         WHERE isbn13 IN (${placeholders})`
      )
      .run(...isbn13Set);

    return result.changes;
  } else if (options?.sinceDays) {
    // 直近N日以内に配信された書籍をリセット
    const result = db
      .prepare(
        `UPDATE books SET last_delivered_at = NULL
         WHERE last_delivered_at >= datetime('now', ?)`
      )
      .run(`-${options.sinceDays} days`);

    return result.changes;
  } else {
    // 全てリセット
    const result = db
      .prepare("UPDATE books SET last_delivered_at = NULL")
      .run();

    return result.changes;
  }
}

/**
 * 全書籍数を取得する
 * @returns 全書籍数
 */
export function getBookCount(): number {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM books").get() as {
    count: number;
  };
  return row.count;
}

/**
 * 未配信書籍数を取得する
 * @returns 未配信書籍数
 */
export function getUndeliveredBookCount(): number {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT COUNT(*) as count FROM books WHERE last_delivered_at IS NULL"
    )
    .get() as { count: number };
  return row.count;
}

// ============================================
// 書籍エンティティのヘルパー関数
// ============================================

/**
 * 書籍の著者配列を取得する
 * @param book - 書籍エンティティ
 * @returns 著者名の配列
 */
export function getBookAuthors(book: Book): string[] {
  if (!book.authors_json) return [];
  try {
    return JSON.parse(book.authors_json);
  } catch {
    return [];
  }
}

/**
 * 書籍のリンク配列を取得する
 * @param book - 書籍エンティティ
 * @returns リンク情報の配列
 */
export function getBookLinks(book: Book): Array<{ label: string; url: string }> {
  if (!book.links_json) return [];
  try {
    return JSON.parse(book.links_json);
  } catch {
    return [];
  }
}

// ============================================
// ジョブ状態
// ============================================

/**
 * ジョブの状態を取得する
 * @param jobName - ジョブ名
 * @returns ジョブ状態、存在しない場合はundefined
 */
export function getJobState(jobName: string): JobState | undefined {
  const db = getDb();
  return db
    .prepare("SELECT * FROM job_state WHERE job_name = ?")
    .get(jobName) as JobState | undefined;
}

/**
 * ジョブの状態を更新する
 * @param jobName - ジョブ名
 * @param updates - 更新内容
 */
export function updateJobState(
  jobName: string,
  updates: { last_success_at?: string; last_run_at?: string }
): void {
  const db = getDb();

  const existing = getJobState(jobName);
  if (!existing) {
    db.prepare(
      `INSERT INTO job_state (job_name, last_success_at, last_run_at)
       VALUES (?, ?, ?)`
    ).run(jobName, updates.last_success_at || null, updates.last_run_at || null);
  } else {
    const sets: string[] = [];
    const values: (string | null)[] = [];

    if (updates.last_success_at !== undefined) {
      sets.push("last_success_at = ?");
      values.push(updates.last_success_at);
    }
    if (updates.last_run_at !== undefined) {
      sets.push("last_run_at = ?");
      values.push(updates.last_run_at);
    }

    if (sets.length > 0) {
      values.push(jobName);
      db.prepare(`UPDATE job_state SET ${sets.join(", ")} WHERE job_name = ?`).run(
        ...values
      );
    }
  }
}

// ============================================
// API利用量
// ============================================

/**
 * API利用量を取得する
 * @param date - 日付（YYYY-MM-DD形式）
 * @param provider - プロバイダ名
 * @returns 利用回数
 */
export function getApiUsage(date: string, provider: string): number {
  const db = getDb();
  const row = db
    .prepare("SELECT count FROM api_usage WHERE date = ? AND provider = ?")
    .get(date, provider) as { count: number } | undefined;
  return row?.count ?? 0;
}

/**
 * API利用量をインクリメントする
 * @param date - 日付（YYYY-MM-DD形式）
 * @param provider - プロバイダ名
 * @returns 更新後の利用回数
 */
export function incrementApiUsage(date: string, provider: string): number {
  const db = getDb();

  db.prepare(
    `INSERT INTO api_usage (date, provider, count) VALUES (?, ?, 1)
     ON CONFLICT(date, provider) DO UPDATE SET count = count + 1`
  ).run(date, provider);

  return getApiUsage(date, provider);
}

// ============================================
// Prompts & Tokens (Ver3.0)
// ============================================

/**
 * プロンプトエンティティ
 */
export interface Prompt {
  id: number;
  isbn13: string;
  prompt_text: string;
  created_at: string;
}

/**
 * プロンプトトークンエンティティ
 */
export interface PromptToken {
  token: string;
  prompt_id: number;
  expires_at: string;
  created_at: string;
}

/**
 * トークンから取得したプロンプト情報
 */
export interface PromptResult {
  promptText: string;
  isbn13: string;
}

/**
 * プロンプトを作成する
 * @param isbn13 - 書籍のISBN-13
 * @param promptText - Deep Research用プロンプトテキスト
 * @returns 作成されたプロンプトのID
 */
export function createPrompt(isbn13: string, promptText: string): number {
  const db = getDb();
  const now = new Date().toISOString();

  const result = db
    .prepare(
      `INSERT INTO prompts (isbn13, prompt_text, created_at)
       VALUES (?, ?, ?)`
    )
    .run(isbn13, promptText, now);

  return result.lastInsertRowid as number;
}

/**
 * トークンを発行する
 * @param promptId - プロンプトID
 * @param expiresInDays - 有効期限（日数、デフォルト30日）
 * @returns 発行されたトークン文字列
 */
export function issueToken(promptId: number, expiresInDays: number = 30): string {
  const db = getDb();
  const now = new Date();
  const token = randomBytes(16).toString("hex");

  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  db.prepare(
    `INSERT INTO prompt_tokens (token, prompt_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(token, promptId, expiresAt.toISOString(), now.toISOString());

  return token;
}

/**
 * トークンからプロンプトを取得する
 * @param token - トークン文字列
 * @returns プロンプト情報、または期限切れ/無効の場合はnull
 */
export function getPromptByToken(token: string): PromptResult | null {
  const db = getDb();

  const row = db
    .prepare(
      `SELECT p.prompt_text, p.isbn13, pt.expires_at
       FROM prompt_tokens pt
       JOIN prompts p ON pt.prompt_id = p.id
       WHERE pt.token = ?`
    )
    .get(token) as { prompt_text: string; isbn13: string; expires_at: string } | undefined;

  if (!row) {
    return null;
  }

  // 期限切れチェック
  const expiresAt = new Date(row.expires_at);
  if (expiresAt < new Date()) {
    return null;
  }

  return {
    promptText: row.prompt_text,
    isbn13: row.isbn13,
  };
}

/**
 * 書籍のプロンプトを作成しトークンを発行する（一括処理）
 * @param isbn13 - 書籍のISBN-13
 * @param promptText - プロンプトテキスト
 * @param expiresInDays - 有効期限（日数、デフォルト30日）
 * @returns トークン文字列
 */
export function createPromptWithToken(
  isbn13: string,
  promptText: string,
  expiresInDays: number = 30
): string {
  const promptId = createPrompt(isbn13, promptText);
  return issueToken(promptId, expiresInDays);
}

/**
 * 期限切れトークンを削除する（クリーンアップ用）
 * @returns 削除されたトークン数
 */
export function cleanupExpiredTokens(): number {
  const db = getDb();
  const result = db
    .prepare(
      `DELETE FROM prompt_tokens
       WHERE expires_at < datetime('now')`
    )
    .run();

  return result.changes;
}
