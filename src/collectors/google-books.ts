import { BookInput, normalizeIsbn13 } from "../db/dao.js";
import {
  Collector,
  CollectorResult,
  CollectorQueryResult,
  CollectorError,
  CursorState,
  CursorInput,
} from "./index.js";
import {
  checkGoogleBooksQuota,
  consumeGoogleBooksQuota,
} from "../utils/quota.js";
import { shortHash } from "../utils/hash.js";

const GOOGLE_BOOKS_API_URL = "https://www.googleapis.com/books/v1/volumes";
const SOURCE_NAME = "google_books";
const API_MAX_RESULTS = 40;

/**
 * Google Books API volume response
 */
interface GoogleBooksVolume {
  id: string;
  volumeInfo: {
    title: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    industryIdentifiers?: Array<{
      type: "ISBN_10" | "ISBN_13" | "OTHER";
      identifier: string;
    }>;
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
    };
    infoLink?: string;
    previewLink?: string;
  };
}

interface GoogleBooksSearchResponse {
  kind: string;
  totalItems: number;
  items?: GoogleBooksVolume[];
}

/**
 * Extract ISBN-13 from industry identifiers
 */
function extractIsbn13(
  identifiers?: Array<{ type: string; identifier: string }>
): string | null {
  if (!identifiers) return null;

  // Prefer ISBN-13
  const isbn13 = identifiers.find((i) => i.type === "ISBN_13");
  if (isbn13) {
    return normalizeIsbn13(isbn13.identifier);
  }

  // Fall back to ISBN-10 (will be converted to ISBN-13)
  const isbn10 = identifiers.find((i) => i.type === "ISBN_10");
  if (isbn10) {
    return normalizeIsbn13(isbn10.identifier);
  }

  return null;
}

/**
 * Convert Google Books volume to BookInput
 */
function volumeToBookInput(volume: GoogleBooksVolume): BookInput | null {
  const isbn13 = extractIsbn13(volume.volumeInfo.industryIdentifiers);
  if (!isbn13) {
    return null; // Skip items without ISBN
  }

  const links: Array<{ label: string; url: string }> = [];

  if (volume.volumeInfo.infoLink) {
    links.push({ label: "Google Books", url: volume.volumeInfo.infoLink });
  }
  if (volume.volumeInfo.previewLink) {
    links.push({ label: "Preview", url: volume.volumeInfo.previewLink });
  }

  // Add Amazon search link
  links.push({
    label: "Amazon",
    url: `https://www.amazon.co.jp/s?k=${isbn13}`,
  });

  return {
    isbn13,
    title: volume.volumeInfo.title,
    authors: volume.volumeInfo.authors,
    publisher: volume.volumeInfo.publisher,
    published_date: volume.volumeInfo.publishedDate,
    description: volume.volumeInfo.description,
    cover_url:
      volume.volumeInfo.imageLinks?.thumbnail ||
      volume.volumeInfo.imageLinks?.smallThumbnail,
    links,
    source: SOURCE_NAME,
  };
}

/**
 * Google Books API 検索オプション（必須）
 */
export interface GoogleBooksSearchOptions {
  printType: string;
  langRestrict: string;
}

/**
 * Google Books API 検索結果（単一リクエスト）
 */
interface SearchResult {
  books: BookInput[];
  skipped: number;
  totalItems: number;
  returned: number;
  apiSuccess: boolean;
}

/**
 * Search Google Books API with pagination support
 */
async function searchGoogleBooks(
  query: string,
  maxResults: number,
  startIndex: number,
  options: GoogleBooksSearchOptions
): Promise<SearchResult> {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  if (!apiKey) {
    throw new CollectorError(
      "GOOGLE_BOOKS_API_KEY environment variable is not set",
      SOURCE_NAME
    );
  }

  const url = new URL(GOOGLE_BOOKS_API_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("maxResults", Math.min(maxResults, API_MAX_RESULTS).toString());
  url.searchParams.set("startIndex", startIndex.toString());
  url.searchParams.set("printType", options.printType);
  url.searchParams.set("langRestrict", options.langRestrict);

  try {
    const response = await fetch(url.toString());

    if (!response.ok) {
      const errorText = await response.text();
      throw new CollectorError(
        `Google Books API error: ${response.status} ${response.statusText} - ${errorText}`,
        SOURCE_NAME
      );
    }

    // Consume quota after successful request
    consumeGoogleBooksQuota();

    const data = (await response.json()) as GoogleBooksSearchResponse;
    const totalItems = data.totalItems ?? 0;
    const returned = data.items?.length ?? 0;

    if (!data.items || data.items.length === 0) {
      return { books: [], skipped: 0, totalItems, returned: 0, apiSuccess: true };
    }

    const books: BookInput[] = [];
    let skipped = 0;

    for (const volume of data.items) {
      const bookInput = volumeToBookInput(volume);
      if (bookInput) {
        books.push(bookInput);
      } else {
        skipped++;
      }
    }

    return { books, skipped, totalItems, returned, apiSuccess: true };
  } catch (error) {
    if (error instanceof CollectorError) {
      throw error;
    }
    throw new CollectorError(
      `Failed to fetch from Google Books API: ${error}`,
      SOURCE_NAME,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * 枯渇判定
 */
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
  return itemsLength === 0 || startIndex + itemsLength >= totalItems;
}

/**
 * Google Books Collector implementation with pagination
 */
export class GoogleBooksCollector implements Collector {
  readonly source = SOURCE_NAME;

  async collect(
    queries: string[],
    maxPerRun: number,
    options: GoogleBooksSearchOptions,
    cursor?: CursorInput
  ): Promise<CollectorResult> {
    const results: CollectorQueryResult[] = [];
    let collectedBooks = 0;
    let totalSkipped = 0;
    let summaryTotalItems = 0;
    let summaryTotalReturned = 0;

    // カーソルから開始位置を取得
    let startIndex = cursor?.startIndex ?? 0;
    const inputExhausted = cursor?.isExhausted ?? false;

    // 枯渇済みなら即終了
    if (inputExhausted) {
      console.warn(`[WARN][${this.source}] Already exhausted, skipping collection`);
      return {
        source: this.source,
        results: [],
        totalBooks: 0,
        totalSkipped: 0,
        totalItems: 0,
        totalReturned: 0,
        cursorState: {
          startIndex,
          isExhausted: true,
          stopReason: "exhausted",
        },
      };
    }

    let stopReason: CursorState["stopReason"] = null;
    let isExhausted = false;
    let pageNumber = 0;
    let lastTotalItems: number | undefined;

    // 全クエリを結合して単一クエリとして扱う（ページング用）
    // Note: Google Books API は複数クエリを OR で結合可能
    const combinedQuery = queries.join(" OR ");

    // ページングループ
    while (collectedBooks < maxPerRun) {
      // クォータチェック
      const quotaCheck = checkGoogleBooksQuota();
      if (!quotaCheck.allowed) {
        console.log(
          `[${this.source}] Stopped: quota limit reached, next startIndex=${startIndex}`
        );
        stopReason = "quota";
        break;
      }

      // 残り件数に応じた maxResults（overfetch 防止）
      const remaining = maxPerRun - collectedBooks;
      const maxResults = Math.min(API_MAX_RESULTS, remaining);

      pageNumber++;

      try {
        const searchResult = await searchGoogleBooks(
          combinedQuery,
          maxResults,
          startIndex,
          options
        );

        lastTotalItems = searchResult.totalItems;

        console.log(
          `[${this.source}] Page ${pageNumber}: startIndex=${startIndex}, returned=${searchResult.returned}, totalItems=${searchResult.totalItems}`
        );

        // 結果を記録
        if (searchResult.books.length > 0 || pageNumber === 1) {
          results.push({
            query: combinedQuery,
            books: searchResult.books,
            skipped: searchResult.skipped,
            totalItems: searchResult.totalItems,
            returned: searchResult.returned,
          });
        }

        collectedBooks += searchResult.books.length;
        totalSkipped += searchResult.skipped;
        summaryTotalItems = searchResult.totalItems; // 最新の totalItems
        summaryTotalReturned += searchResult.returned;

        // 枯渇判定（API 成功時のみ）
        if (
          checkExhaustion(
            searchResult.apiSuccess,
            searchResult.totalItems,
            startIndex,
            searchResult.returned
          )
        ) {
          isExhausted = true;
          stopReason = "exhausted";

          // 枯渇時のログ（hash は呼び出し元から渡されないのでここでは省略）
          console.warn(
            `[WARN][${this.source}] Exhausted: startIndex=${startIndex + searchResult.returned} >= totalItems=${searchResult.totalItems}`
          );

          // items.length > 0 なら startIndex を更新
          if (searchResult.returned > 0) {
            startIndex += searchResult.returned;
          }
          // items.length === 0 なら startIndex 据え置き
          break;
        }

        // startIndex を更新
        startIndex += searchResult.returned;

        // 上限到達判定
        if (collectedBooks >= maxPerRun) {
          stopReason = "max_per_run";
          console.log(
            `[${this.source}] Stopped: max_per_run reached (${collectedBooks}/${maxPerRun}), next startIndex=${startIndex}`
          );
          break;
        }
      } catch (error) {
        // エラー時は枯渇にせず停止
        stopReason = "error";
        console.error(
          `[${this.source}] Stopped: API error, preserving startIndex=${startIndex}`
        );
        if (error instanceof CollectorError) {
          console.error(`[ERROR] ${error.message}`);
        } else {
          throw error;
        }
        break;
      }
    }

    // ボトルネック検出ログ（枯渇でない場合のみ）
    if (!isExhausted && lastTotalItems !== undefined && summaryTotalReturned < lastTotalItems) {
      console.log(
        `[${this.source}] Bottleneck: API returned (${summaryTotalReturned}) << totalItems (${lastTotalItems}) -> pagination in progress`
      );
    }

    return {
      source: this.source,
      results,
      totalBooks: collectedBooks,
      totalSkipped,
      totalItems: summaryTotalItems,
      totalReturned: summaryTotalReturned,
      cursorState: {
        startIndex,
        isExhausted,
        stopReason,
      },
    };
  }
}

/**
 * Create a Google Books collector instance
 */
export function createGoogleBooksCollector(): GoogleBooksCollector {
  return new GoogleBooksCollector();
}
