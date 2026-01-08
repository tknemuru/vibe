import { upsertItem, Item } from "../db/dao.js";
import { consumeQuota, checkQuota } from "../utils/quota.js";

interface GoogleSearchResult {
  title: string;
  link: string;
  snippet?: string;
}

interface GoogleSearchResponse {
  items?: GoogleSearchResult[];
  error?: {
    code: number;
    message: string;
  };
}

export class SearchError extends Error {
  constructor(message: string, public code?: number) {
    super(message);
    this.name = "SearchError";
  }
}

function buildSearchQuery(query: string, allowlist: string[]): string {
  if (allowlist.length === 0) {
    return query;
  }
  const siteRestriction = allowlist.map((domain) => `site:${domain}`).join(" OR ");
  return `(${query}) (${siteRestriction})`;
}

export async function searchGoogle(
  query: string,
  allowlist: string[],
  numResults: number = 10
): Promise<GoogleSearchResult[]> {
  const apiKey = process.env.GCS_API_KEY;
  const cx = process.env.GCS_CX;

  if (!apiKey || !cx) {
    throw new SearchError("GCS_API_KEY and GCS_CX must be set in environment");
  }

  // Check and consume quota before making API call
  const quotaCheck = checkQuota();
  if (!quotaCheck.allowed) {
    throw new SearchError(
      `Daily quota limit reached (${quotaCheck.current}/${quotaCheck.limit}). ` +
        "Search skipped to prevent charges."
    );
  }

  const fullQuery = buildSearchQuery(query, allowlist);
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", fullQuery);
  url.searchParams.set("num", Math.min(numResults, 10).toString());
  // dateRestrict for freshness (w1 = past week)
  url.searchParams.set("dateRestrict", "w1");

  const response = await fetch(url.toString());
  const data = (await response.json()) as GoogleSearchResponse;

  if (data.error) {
    throw new SearchError(data.error.message, data.error.code);
  }

  // Only consume quota after successful API response
  const consumeResult = consumeQuota();
  if (!consumeResult.success) {
    // This shouldn't happen since we checked before, but handle it anyway
    console.warn("Quota consumption failed after successful search");
  }

  return data.items || [];
}

export interface CollectResult {
  items: Item[];
  query: string;
  quotaUsed: boolean;
}

export async function collectSearchResults(
  query: string,
  allowlist: string[],
  numResults: number = 10
): Promise<CollectResult> {
  const searchResults = await searchGoogle(query, allowlist, numResults);

  const items: Item[] = [];
  for (const result of searchResults) {
    const item = upsertItem(result.link, result.title, result.snippet || null);
    items.push(item);
  }

  return {
    items,
    query,
    quotaUsed: true,
  };
}
