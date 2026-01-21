import { Book, BookInput } from "../db/dao.js";
import type { GoogleBooksConfig } from "../config/jobs.js";

/**
 * Result from a single query collection
 */
export interface CollectorQueryResult {
  query: string;
  books: BookInput[];
  skipped: number; // Items skipped (no ISBN, etc.)
  totalItems: number; // API が持っている総件数
  returned: number; // API が今回返した件数
}

/**
 * カーソル状態（ページング用）
 */
export interface CursorState {
  startIndex: number;
  isExhausted: boolean;
  stopReason: "quota" | "max_per_run" | "exhausted" | "error" | null;
}

/**
 * カーソル入力（Collector に渡す）
 */
export interface CursorInput {
  startIndex: number;
  isExhausted: boolean;
}

/**
 * Result from a collector run
 */
export interface CollectorResult {
  source: string;
  results: CollectorQueryResult[];
  totalBooks: number;
  totalSkipped: number;
  totalItems: number; // 全クエリ合計の API 総件数
  totalReturned: number; // 全クエリ合計の API 返却件数
  cursorState: CursorState; // ページング状態
}

/**
 * Collector interface for book collection from various sources
 */
export interface Collector {
  /**
   * Source name (e.g., "google_books")
   */
  readonly source: string;

  /**
   * Collect books for given queries
   * @param queries Search queries
   * @param maxPerRun Maximum books to collect per run
   * @param options Google Books API 検索オプション
   * @param cursor ページング用カーソル入力（省略可）
   * @returns Collection result
   */
  collect(
    queries: string[],
    maxPerRun: number,
    options: GoogleBooksConfig,
    cursor?: CursorInput
  ): Promise<CollectorResult>;
}

/**
 * Collector error class
 */
export class CollectorError extends Error {
  constructor(
    message: string,
    public readonly source: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "CollectorError";
  }
}
