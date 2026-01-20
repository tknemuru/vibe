import { BookInput, normalizeIsbn13 } from "../db/dao.js";
import {
  Collector,
  CollectorResult,
  CollectorQueryResult,
  CollectorError,
} from "./index.js";
import {
  checkGoogleBooksQuota,
  consumeGoogleBooksQuota,
} from "../utils/quota.js";

const GOOGLE_BOOKS_API_URL = "https://www.googleapis.com/books/v1/volumes";
const SOURCE_NAME = "google_books";

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
 * Search Google Books API
 */
/**
 * Google Books API 検索オプション（必須）
 */
export interface GoogleBooksSearchOptions {
  printType: string;
  langRestrict: string;
}

/**
 * Google Books API 検索結果
 */
interface SearchResult {
  books: BookInput[];
  skipped: number;
  totalItems: number;
  returned: number;
}

async function searchGoogleBooks(
  query: string,
  maxResults: number,
  options: GoogleBooksSearchOptions
): Promise<SearchResult> {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  if (!apiKey) {
    throw new CollectorError(
      "GOOGLE_BOOKS_API_KEY environment variable is not set",
      SOURCE_NAME
    );
  }

  // Check quota before making request
  const quotaCheck = checkGoogleBooksQuota();
  if (!quotaCheck.allowed) {
    throw new CollectorError(
      `Google Books API quota exceeded (${quotaCheck.current}/${quotaCheck.limit})`,
      SOURCE_NAME
    );
  }

  const url = new URL(GOOGLE_BOOKS_API_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("maxResults", Math.min(maxResults, 40).toString()); // API max is 40
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
      return { books: [], skipped: 0, totalItems, returned: 0 };
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

    return { books, skipped, totalItems, returned };
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
 * Google Books Collector implementation
 */
export class GoogleBooksCollector implements Collector {
  readonly source = SOURCE_NAME;

  async collect(
    queries: string[],
    maxPerRun: number,
    options: GoogleBooksSearchOptions
  ): Promise<CollectorResult> {
    const results: CollectorQueryResult[] = [];
    let totalBooks = 0;
    let totalSkipped = 0;
    let totalItems = 0;
    let totalReturned = 0;

    // Calculate how many results to fetch per query
    const perQuery = Math.ceil(maxPerRun / queries.length);

    for (const query of queries) {
      // Check quota before each query
      const quotaCheck = checkGoogleBooksQuota();
      if (!quotaCheck.allowed) {
        console.warn(
          `[WARN] Google Books quota exhausted, stopping collection early`
        );
        break;
      }

      // Stop if we've collected enough
      if (totalBooks >= maxPerRun) {
        break;
      }

      const remaining = maxPerRun - totalBooks;
      const toFetch = Math.min(perQuery, remaining);

      try {
        const searchResult = await searchGoogleBooks(query, toFetch, options);

        // ログ出力: クエリごとの API 取得状況（printType / langRestrict を含む）
        console.log(
          `[Collect] query="${query}", printType=${options.printType}, langRestrict=${options.langRestrict}, totalItems=${searchResult.totalItems}, returned=${searchResult.returned}, skipped=${searchResult.skipped} (no ISBN)`
        );

        results.push({
          query,
          books: searchResult.books,
          skipped: searchResult.skipped,
          totalItems: searchResult.totalItems,
          returned: searchResult.returned,
        });

        totalBooks += searchResult.books.length;
        totalSkipped += searchResult.skipped;
        totalItems += searchResult.totalItems;
        totalReturned += searchResult.returned;
      } catch (error) {
        if (error instanceof CollectorError) {
          console.error(`[ERROR] ${error.message}`);
          // Continue with other queries on error
        } else {
          throw error;
        }
      }
    }

    return {
      source: this.source,
      results,
      totalBooks,
      totalSkipped,
      totalItems,
      totalReturned,
    };
  }
}

/**
 * Create a Google Books collector instance
 */
export function createGoogleBooksCollector(): GoogleBooksCollector {
  return new GoogleBooksCollector();
}
